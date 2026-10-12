import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Staples Jobs Scraper
 *
 * Scrapes job listings from careers.staples.com.
 * List page: paginated via ?p=N, 15 jobs per page.
 * Detail page: has Date posted, Pay Range, Category, Qualifications.
 *
 * Usage: pnpm exec tsx scripts/scrape-staples-jobs.ts
 */

import { BrowserContext, chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, extractPayRange, parseSlashDate,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Staples',
    dateWindowDays: 14,
    maxPages: 20,
    detailConcurrency: 4,
}

type ListJob = { url: string; title: string }


type DetailData = {
    title: string
    location: string
    datePosted: string | null
    pay: string
    category: string
    remote: string
    jobId: string
    description: string
    required: string[]
    preferred: string[]
}

async function fetchStaplesDetail(context: BrowserContext, jobUrl: string): Promise<DetailData | null> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(randomDelay(2000, 3500))

        const data = await page.evaluate(() => {
            const body = document.body.innerText || ''
            const titleEl = document.querySelector('h1')
            const title = titleEl?.textContent?.trim() || ''

            const dateMatch = body.match(/Date posted\s*([\d\/]+)/i)
            const payMatch = body.match(/Pay Range\s*([^\n]+)/i)
            const catMatch = body.match(/Category\s*([^\n]+)/i)
            const idMatch = body.match(/Job ID\s*(\d+)/i)
            const remoteMatch = body.match(/Remote\/On-site\s*([^\n]+)/i)

            // Location: usually right after the title in format "City, State, United States"
            const locMatch = body.match(/(?:United States|Remote)[\s\S]*?(?=\nApply|\nSave)/i)
            // Simpler: get the text between title and "Apply"
            const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
            const titleIdx = lines.findIndex(l => l === title)
            const location = titleIdx >= 0 && titleIdx + 1 < lines.length ? lines[titleIdx + 1] : ''

            // Description and qualifications
            const descIdx = body.indexOf('Description')
            const qualIdx = body.indexOf("What's needed-")
            const prefIdx = body.indexOf("What's needed- Preferred")
            const aboutIdx = body.indexOf('We Offer')

            let desc = ''
            let required: string[] = []
            let preferred: string[] = []

            if (descIdx > -1) {
                const end = qualIdx > descIdx ? qualIdx : (aboutIdx > descIdx ? aboutIdx : descIdx + 2000)
                desc = body.slice(descIdx + 12, end).trim()
            }

            if (qualIdx > -1) {
                const reqEnd = prefIdx > qualIdx ? prefIdx : (aboutIdx > qualIdx ? aboutIdx : qualIdx + 1000)
                const reqText = body.slice(qualIdx, reqEnd)
                required = reqText.split('\n').map(l => l.trim()).filter(l => l.length > 10 && !l.startsWith("What's"))
            }

            if (prefIdx > -1) {
                const prefEnd = aboutIdx > prefIdx ? aboutIdx : prefIdx + 1000
                const prefText = body.slice(prefIdx, prefEnd)
                preferred = prefText.split('\n').map(l => l.trim()).filter(l => l.length > 10 && !l.startsWith("What's"))
            }

            return {
                title,
                location: location || '',
                datePosted: dateMatch?.[1] || null,
                pay: payMatch?.[1]?.trim() || '',
                category: catMatch?.[1]?.trim() || '',
                remote: remoteMatch?.[1]?.trim() || '',
                jobId: idMatch?.[1] || '',
                description: desc,
                required,
                preferred,
            }
        })

        return data
    } catch {
        return null
    } finally {
        await page.close()
    }
}

async function scrapeStaplesJobs() {
    console.log(`🚀 Staples Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        // Phase 1: Collect all job URLs from list pages
        console.log('📋 Phase 1: Collecting job URLs from list pages...')
        const jobUrls: ListJob[] = []
        const seenUrls = new Set<string>()

        for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
            const url = pageNum === 1
                ? 'https://careers.staples.com/en/search-jobs'
                : `https://careers.staples.com/en/search-jobs?p=${pageNum}`

            console.log(`📄 Page ${pageNum}...`)
            const page = await context.newPage()
            await navigateSource(page, url, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(randomDelay(5000, 8000))

            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href*="/en/job/"]')).map(a => ({
                    url: (a as HTMLAnchorElement).href,
                    title: a.textContent?.trim().split('\n')[0]?.trim() || '',
                }))
            })
            await page.close()

            if (links.length === 0) {
                console.log('   📭 No jobs. Done.')
                break
            }

            let added = 0
            for (const l of links) {
                if (!seenUrls.has(l.url)) {
                    seenUrls.add(l.url)
                    jobUrls.push(l)
                    added++
                }
            }
            console.log(`   ✅ ${added} new URLs (${jobUrls.length} total)`)
        }

        console.log(`\n📋 ${jobUrls.length} job URLs collected. Fetching details...`)

        // Phase 2: Fetch detail pages in batches
        const collectedJobs: DbJob[] = []
        let dateSkipped = 0
        let noDate = 0

        for (let i = 0; i < jobUrls.length; i += CONFIG.detailConcurrency) {
            const batch = jobUrls.slice(i, i + CONFIG.detailConcurrency)
            console.log(`🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, jobUrls.length)} / ${jobUrls.length}`)

            const details = await Promise.all(
                batch.map(j => fetchStaplesDetail(context, j.url))
            )

            for (let k = 0; k < batch.length; k++) {
                const d = details[k]
                if (!d || !d.datePosted) { noDate++; continue }

                const postedDate = parseSlashDate(d.datePosted)
                if (!postedDate) { noDate++; continue }
                if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                const title = d.title || batch[k].title
                const fullText = [title, d.location, d.description, d.pay].filter(Boolean).join('\n')

                // Truncate fields to fit varchar(255) DB columns
                const loc = (d.location || 'United States').slice(0, 250)
                const payRange = (d.pay || extractPayRange(fullText)).slice(0, 250)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `staples_${d.jobId || batch[k].url.split('/').pop() || ''}`,
                    title: title.slice(0, 250),
                    location: loc,
                    location_type: determineLocationType(loc, d.remote),
                    department: normalizeDepartment(d.category || 'General', title),
                    employment_type: determineEmploymentType(title),
                    posted_date: postedDate,
                    description: d.description || `${title} at Staples - ${d.location}`,
                    summary: `${title} at Staples - ${loc}`.slice(0, 250),
                    required_qualifications: d.required,
                    preferred_qualifications: d.preferred,
                    pay_range: payRange,
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    structuredSourceFields: {
                        department: d.category || null,
                        pay_range: d.pay || null,
                        required_qualifications: d.required,
                        preferred_qualifications: d.preferred,
                    },
                    sourceHints: { remote: d.remote || '' },
                    job_url: batch[k].url,
                    is_active: true,
                }
                collectedJobs.push(job)
            }

            await sleep(randomDelay(300, 800))
        }

        console.log(`\n📊 Total: ${collectedJobs.length} jobs (${dateSkipped} date-skipped, ${noDate} no-date)`)

        if (collectedJobs.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount,
            company.careers_url || 'https://careers.staples.com/en/search-jobs')

    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeStaplesJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
