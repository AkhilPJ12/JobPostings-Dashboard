import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Wipro Jobs Scraper
 *
 * Scrapes job listings from careers.wipro.com.
 * List page: paginated via pageNumber param, 10 per page, sorted by date.
 * Detail page: has "Posting Start Date: M/DD/YY" format.
 *
 * Usage: pnpm exec tsx scripts/scrape-wipro-jobs.ts
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
    companyName: 'Wipro',
    dateWindowDays: 14,
    maxPages: 20,
    detailConcurrency: 4,
}

type ListJob = { url: string; title: string; id: string }


async function fetchWiproDetail(context: BrowserContext, jobUrl: string): Promise<{
    title: string; location: string; state: string; postedDate: string | null; description: string
} | null> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(randomDelay(2000, 4000))

        return await page.evaluate(() => {
            const body = document.body.innerText || ''
            const titleEl = document.querySelector('h1') || document.querySelector('[class*=job-title]')
            const title = titleEl?.textContent?.trim() || ''

            const cityMatch = body.match(/City:\s*([^\n]+)/i)
            const stateMatch = body.match(/State\/Province:\s*([^\n]+)/i)
            const dateMatch = body.match(/Posting Start Date:\s*([^\n]+)/i)

            // Description is everything after the metadata block
            const descStart = body.indexOf('Wipro Limited') > -1 ? body.indexOf('Wipro Limited') : body.indexOf('Job Description')
            const desc = descStart > -1 ? body.slice(descStart, descStart + 3000).trim() : ''

            return {
                title,
                location: cityMatch?.[1]?.trim() || '',
                state: stateMatch?.[1]?.trim() || '',
                postedDate: dateMatch?.[1]?.trim() || null,
                description: desc.slice(0, 2000),
            }
        })
    } catch {
        return null
    } finally {
        await page.close()
    }
}

async function scrapeWiproJobs() {
    console.log(`🚀 Wipro Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const baseUrl = company.careers_url || 'https://careers.wipro.com/search/?q=&locationsearch=&searchResultView=LIST&pageNumber=0&facetFilters=%7B%22jobLocationCountry%22%3A%5B%22United+States%22%5D%7D&sortBy=date'
    console.log(`🔗 Career URL: ${baseUrl}`)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        // Phase 1: Collect job URLs
        console.log('📋 Phase 1: Collecting job URLs...')
        const jobUrls: ListJob[] = []
        const seenIds = new Set<string>()

        for (let pageNum = 0; pageNum < CONFIG.maxPages; pageNum++) {
            const url = baseUrl.replace(/pageNumber=\d+/, `pageNumber=${pageNum}`)
            console.log(`📄 Page ${pageNum + 1}...`)

            const page = await context.newPage()
            await navigateSource(page, url, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(randomDelay(5000, 8000))
            if (pageNum === 0) {
                await page.click('button:has-text("Accept")').catch(() => {})
                await sleep(2000)
            }

            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href*="/job/"]'))
                    .filter(a => a.textContent && a.textContent.trim().length > 3 && a.textContent.trim().length < 100)
                    .map(a => {
                        const href = (a as HTMLAnchorElement).href
                        const idMatch = href.match(/\/(\d+)-en_US/)
                        return { url: href, title: a.textContent?.trim() || '', id: idMatch?.[1] || '' }
                    })
                    .filter(j => j.id)
            })
            await page.close()

            if (links.length === 0) {
                console.log('   📭 No jobs. Done.')
                break
            }

            let added = 0
            for (const l of links) {
                if (!seenIds.has(l.id)) {
                    seenIds.add(l.id)
                    jobUrls.push(l)
                    added++
                }
            }
            console.log(`   ✅ ${added} new (${jobUrls.length} total)`)
        }

        console.log(`\n📋 ${jobUrls.length} job URLs. Fetching details...`)
        if (jobUrls.length === 0) { console.log('⚠️  No jobs found.'); return }

        // Phase 2: Fetch details
        const collectedJobs: DbJob[] = []
        let dateSkipped = 0, noDate = 0

        for (let i = 0; i < jobUrls.length; i += CONFIG.detailConcurrency) {
            const batch = jobUrls.slice(i, i + CONFIG.detailConcurrency)
            console.log(`🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, jobUrls.length)} / ${jobUrls.length}`)

            const details = await Promise.all(batch.map(j => fetchWiproDetail(context, j.url)))

            for (let k = 0; k < batch.length; k++) {
                const d = details[k]
                if (!d || !d.postedDate) { noDate++; continue }

                const postedDate = parseSlashDate(d.postedDate)
                if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    dateSkipped++; continue
                }

                const title = d.title || batch[k].title
                const location = [d.location, d.state].filter(Boolean).join(', ')
                const fullText = [title, location, d.description].join('\n')

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `wipro_${batch[k].id}`,
                    title: title.slice(0, 250),
                    location: location.slice(0, 250),
                    location_type: determineLocationType(location, d.description),
                    department: normalizeDepartment('General', title),
                    employment_type: determineEmploymentType(title),
                    posted_date: postedDate,
                    description: d.description || `${title} at Wipro - ${location}`,
                    summary: `${title} at Wipro - ${location}`.slice(0, 250),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(fullText),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: batch[k].url,
                    is_active: true,
                }
                collectedJobs.push(job)
            }
            await sleep(randomDelay(300, 800))
        }

        console.log(`\n📊 Total: ${collectedJobs.length} jobs (${dateSkipped} date-skipped, ${noDate} no-date)`)
        if (collectedJobs.length === 0) { console.log('⚠️  No jobs found.'); return }

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, baseUrl)
    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeWiproJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
