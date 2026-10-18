import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Intuit Jobs Scraper
 *
 * Scrapes job listings from jobs.intuit.com.
 * List page: client-side pagination (click "Next"), 18 jobs per page.
 * Detail page: has description, category, location, job ID — but NO posted date.
 * Uses "first-seen date" pattern: new jobs get today's date, preserved on re-runs.
 *
 * Sort by "Date Posted" is selected via dropdown to get most recent jobs first.
 *
 * Usage: pnpm exec tsx scripts/scrape-intuit-jobs.ts
 */

import { BrowserContext, chromium, Page } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Intuit',
    maxPages: 15,
    detailConcurrency: 4,
}

type ListJob = { url: string; title: string; location: string }

type DetailData = {
    title: string
    location: string
    category: string
    jobId: string
    description: string
    required: string[]
    preferred: string[]
}

async function fetchIntuitDetail(context: BrowserContext, jobUrl: string): Promise<DetailData | null> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(randomDelay(2000, 4000))

        return await page.evaluate(() => {
            const body = document.body.innerText || ''
            const titleEl = document.querySelector('h1')
            const title = titleEl?.textContent?.trim() || ''

            const catMatch = body.match(/Category\s*([^\n]+)/i)
            const locMatch = body.match(/Location\s*([^\n]+)/i)
            const idMatch = body.match(/Job ID\s*(\d+)/i)

            // Find description — everything between "Apply Now" block and "Qualifications" or end
            const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
            const descStartIdx = lines.findIndex(l => /^(Company Overview|Job Overview|Overview|About the|Description)/i.test(l))
            const qualIdx = lines.findIndex(l => /^(Qualifications|Minimum Requirements|What you|Requirements)/i.test(l))

            let desc = ''
            let required: string[] = []
            let preferred: string[] = []

            if (descStartIdx > -1) {
                const end = qualIdx > descStartIdx ? qualIdx : Math.min(descStartIdx + 30, lines.length)
                desc = lines.slice(descStartIdx, end).join('\n')
            }

            if (qualIdx > -1) {
                const prefIdx = lines.findIndex((l, i) => i > qualIdx && /preferred|bonus|nice to have/i.test(l))
                const endIdx = lines.findIndex((l, i) => i > qualIdx && /^(Apply|How you|Intuit provides|Equal)/i.test(l))
                const reqEnd = prefIdx > qualIdx ? prefIdx : (endIdx > qualIdx ? endIdx : Math.min(qualIdx + 20, lines.length))
                required = lines.slice(qualIdx + 1, reqEnd).filter(l => l.length > 10)
                if (prefIdx > -1) {
                    const prefEnd = endIdx > prefIdx ? endIdx : Math.min(prefIdx + 15, lines.length)
                    preferred = lines.slice(prefIdx + 1, prefEnd).filter(l => l.length > 10)
                }
            }

            return {
                title,
                location: locMatch?.[1]?.trim() || '',
                category: catMatch?.[1]?.trim() || '',
                jobId: idMatch?.[1] || '',
                description: desc,
                required,
                preferred,
            }
        })
    } catch {
        return null
    } finally {
        await page.close()
    }
}

async function collectJobLinksFromPage(page: Page): Promise<ListJob[]> {
    return page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/job/') && !a.href.includes('search') && !a.href.includes('saved'))
        return links.map(a => {
            const text = a.textContent?.trim() || ''
            const title = text.split('\n')[0]?.trim() || ''
            // Location is usually in the next sibling or child span
            const parent = a.closest('li') || a.parentElement
            const locEl = parent?.querySelector('span[class*=location], .job-location')
            const location = locEl?.textContent?.trim() || ''
            return { url: (a as HTMLAnchorElement).href, title, location }
        })
    })
}

async function scrapeIntuitJobs() {
    console.log(`🚀 Intuit Jobs Scraper`)
    console.log(`📅 Using first-seen date (no posting dates available)`)
    console.log(`📄 Scraping ${CONFIG.maxPages} pages sorted by Date Posted\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://jobs.intuit.com/search-jobs/United%20States/27595/2/6252001/39x76/-98x5/0/2'
    console.log(`🔗 Career URL: ${careerUrl}`)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        // Phase 1: Collect job URLs from list pages
        console.log('\n📋 Phase 1: Collecting job URLs...')
        const page = await context.newPage()
        await navigateSource(page, careerUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await sleep(10000)

        // Sort by Date Posted
        console.log('🔄 Sorting by Date Posted...')
        await page.selectOption('select[id*="sort-criteria"]', { label: 'Date Posted' }).catch(async () => {
            // Fallback: try first select on page
            await page.selectOption('select', { label: 'Date Posted' }).catch(() => {
                console.log('   ⚠️ Could not find sort dropdown')
            })
        })
        await sleep(5000)

        const allJobLinks: ListJob[] = []
        const seenUrls = new Set<string>()

        for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
            console.log(`📄 Page ${pageNum}...`)

            const jobs = await collectJobLinksFromPage(page)
            let added = 0
            for (const j of jobs) {
                if (!seenUrls.has(j.url)) {
                    seenUrls.add(j.url)
                    allJobLinks.push(j)
                    added++
                }
            }
            console.log(`   ✅ ${added} new (${allJobLinks.length} total)`)

            if (added === 0) {
                console.log('   📭 No new jobs. Stopping.')
                break
            }

            // Click Next
            if (pageNum < CONFIG.maxPages) {
                const nextClicked = await page.evaluate(() => {
                    const nextLink = Array.from(document.querySelectorAll('a'))
                        .find(a => a.textContent?.trim() === 'Next' && a.getAttribute('href'))
                    if (nextLink) { (nextLink as HTMLElement).click(); return true }
                    return false
                })
                if (!nextClicked) {
                    console.log('   📭 No Next button. Done.')
                    break
                }
                await sleep(randomDelay(3000, 5000))
            }
        }

        await page.close()
        console.log(`\n📋 ${allJobLinks.length} job URLs collected. Fetching details...`)

        if (allJobLinks.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        // Phase 2: Fetch detail pages
        const today = new Date().toISOString().split('T')[0]
        const collectedJobs: DbJob[] = []

        for (let i = 0; i < allJobLinks.length; i += CONFIG.detailConcurrency) {
            const batch = allJobLinks.slice(i, i + CONFIG.detailConcurrency)
            console.log(`🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, allJobLinks.length)} / ${allJobLinks.length}`)

            const details = await Promise.all(
                batch.map(j => fetchIntuitDetail(context, j.url))
            )

            for (let k = 0; k < batch.length; k++) {
                const d = details[k]
                const listJob = batch[k]
                const title = d?.title || listJob.title
                const location = d?.location || listJob.location || ''
                const fullText = [title, location, d?.description || ''].join('\n')

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `intuit_${d?.jobId || listJob.url.match(/\/(\d+)$/)?.[1] || ''}`,
                    title: title.slice(0, 250),
                    location: location.slice(0, 250),
                    location_type: determineLocationType(location),
                    department: normalizeDepartment(d?.category || 'General', title),
                    employment_type: determineEmploymentType(title),
                    posted_date: today,
                    description: d?.description || `${title} at Intuit - ${location}`,
                    summary: `${title} at Intuit - ${location}`.slice(0, 250),
                    required_qualifications: d?.required || [],
                    preferred_qualifications: d?.preferred || [],
                    pay_range: extractPayRange(fullText),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: listJob.url,
                    is_active: true,
                }
                collectedJobs.push(job)
            }

            await sleep(randomDelay(300, 800))
        }

        // Deduplicate by external_job_id (same job can appear with different URLs)
        const uniqueJobs = new Map<string, DbJob>()
        for (const job of collectedJobs) {
            if (!uniqueJobs.has(job.external_job_id)) {
                uniqueJobs.set(job.external_job_id, job)
            }
        }
        const dedupedJobs = Array.from(uniqueJobs.values())
        console.log(`\n📊 Total jobs collected: ${collectedJobs.length} (${dedupedJobs.length} unique)`)

        console.log(`\n🗄️  Upserting ${dedupedJobs.length} jobs (preserving first-seen dates)...`)
        const upsertedCount = await upsertJobsBatch(dedupedJobs, 50, true)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, careerUrl)

    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeIntuitJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
