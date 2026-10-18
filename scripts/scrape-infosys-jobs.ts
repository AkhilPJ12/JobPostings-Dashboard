import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Infosys Jobs Scraper
 *
 * Scrapes job listings from digitalcareers.infosys.com.
 * List page: paginated via page param, up to 100 per page.
 * Detail page: has salary, skills, description — but NO posted date.
 * Uses "first-seen date" pattern.
 *
 * Usage: pnpm exec tsx scripts/scrape-infosys-jobs.ts
 */

import { BrowserContext, chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Infosys',
    maxPages: 6, // 100 per page × 6 = 600 (total ~560 US jobs)
}

type ListJob = { url: string; title: string; id: string }

async function fetchInfosysDetail(context: BrowserContext, jobUrl: string): Promise<{
    title: string; location: string; salary: string; description: string; skills: string
} | null> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(randomDelay(2000, 4000))

        return await page.evaluate(() => {
            const body = document.body.innerText || ''
            const titleEl = document.querySelector('h1') || document.querySelector('[class*=job-title]')
            const title = titleEl?.textContent?.trim() || ''
            const locMatch = body.match(/Work Location\s*([^\n]+)/i)
            const salMinMatch = body.match(/Salary min\s*(\d+)/i)
            const salMaxMatch = body.match(/Salary max\s*(\d+)/i)
            const salary = salMinMatch && salMaxMatch ? `$${Number(salMinMatch[1]).toLocaleString()} - $${Number(salMaxMatch[1]).toLocaleString()}` : ''
            const skillsMatch = body.match(/Skills\s*([^\n]+)/i)

            // Description: everything after the metadata
            const descStart = body.indexOf('Infosys is seeking') > -1 ? body.indexOf('Infosys is seeking') : body.indexOf('Job Description')
            const desc = descStart > -1 ? body.slice(descStart, descStart + 3000).trim() : ''

            return {
                title,
                location: locMatch?.[1]?.trim() || '',
                salary,
                description: desc.slice(0, 2000),
                skills: skillsMatch?.[1]?.trim() || '',
            }
        })
    } catch {
        return null
    } finally {
        await page.close()
    }
}

async function scrapeInfosysJobs() {
    console.log(`🚀 Infosys Jobs Scraper`)
    console.log(`📅 Using first-seen date (no posting dates available)\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const urls = [company.careers_url, company.careers_url_1].filter(Boolean) as string[]
    if (urls.length === 0) { console.error('❌ No careers URL'); return }

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        const allJobLinks: ListJob[] = []
        const seenIds = new Set<string>()
        const today = new Date().toISOString().split('T')[0]

        for (const [urlIdx, baseUrl] of urls.entries()) {
            if (urlIdx > 0) console.log(`\n🔗 Scraping secondary URL (careers_url_1)...`)
            console.log(`🔗 URL: ${baseUrl}`)

            for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
                const url = baseUrl.replace(/page=\d+/, `page=${pageNum}`)
                console.log(`📄 Page ${pageNum}...`)

                const page = await context.newPage()
                await navigateSource(page, url, { waitUntil: 'domcontentloaded', timeout: 60000 })
                await sleep(randomDelay(5000, 8000))

                const links = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('a[href*="/company-job/description/reqid/"]'))
                        .map(a => {
                            const href = (a as HTMLAnchorElement).href
                            const idMatch = href.match(/reqid\/([^/]+)/)
                            return { url: href, title: a.textContent?.trim().split('\n')[0]?.trim() || '', id: idMatch?.[1] || '' }
                        })
                        .filter(j => j.id && j.title.length > 3)
                })
                await page.close()

                if (links.length === 0) { console.log('   📭 No jobs. Done.'); break }

                let added = 0
                for (const l of links) {
                    if (!seenIds.has(l.id)) { seenIds.add(l.id); allJobLinks.push(l); added++ }
                }
                console.log(`   ✅ ${added} new (${allJobLinks.length} total)`)
            }
        }

        console.log(`\n📋 ${allJobLinks.length} jobs. Fetching details...`)
        if (allJobLinks.length === 0) { console.log('⚠️  No jobs found.'); return }

        const collectedJobs: DbJob[] = []
        const detailConcurrency = 4

        for (let i = 0; i < allJobLinks.length; i += detailConcurrency) {
            const batch = allJobLinks.slice(i, i + detailConcurrency)
            console.log(`🔍 Details ${i + 1}–${Math.min(i + detailConcurrency, allJobLinks.length)} / ${allJobLinks.length}`)

            const details = await Promise.all(batch.map(j => fetchInfosysDetail(context, j.url)))

            for (let k = 0; k < batch.length; k++) {
                const d = details[k]
                const title = d?.title || batch[k].title
                const location = d?.location || ''
                const fullText = [title, location, d?.description || ''].join('\n')

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `infosys_${batch[k].id}`,
                    title: title.slice(0, 250),
                    location: location.slice(0, 250),
                    location_type: determineLocationType(location),
                    department: normalizeDepartment('General', title),
                    employment_type: determineEmploymentType(title),
                    posted_date: today,
                    description: d?.description || '',
                    summary: `${title} at Infosys - ${location}`.slice(0, 250),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: d?.salary || extractPayRange(fullText),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: batch[k].url,
                    is_active: true,
                }
                collectedJobs.push(job)
            }
            await sleep(randomDelay(300, 800))
        }

        console.log(`\n📊 Total: ${collectedJobs.length} jobs`)

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs (preserving first-seen dates)...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs, 50, true)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, urls[0])
    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeInfosysJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
