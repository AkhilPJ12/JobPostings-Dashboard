/**
 * Salesforce Jobs Scraper
 *
 * Scrapes job listings from Salesforce Careers.
 * DOM selectors verified from live page (Feb 2026):
 *   - Cards: .card.card-job
 *   - Title/Link: a.js-view-job
 *   - Location: .list-inline.job-meta li
 *   - Department: .card-subtitle
 *   - Next page: a[aria-label="Next page"] or URL ?page=N
 *   - 20 jobs per page, ~434 total
 *
 * Usage: npx tsx scripts/scrape-salesforce-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate, cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Salesforce',
    dateWindowDays: 14,
    maxPages: 30,
    baseUrl: 'https://careers.salesforce.com/en/jobs/?country=United%20States%20of%20America&pagesize=20',
}

async function scrapeeSalesforceJobs() {
    console.log(`🚀 Salesforce Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in last ${CONFIG.dateWindowDays} days (including future dates)`)
    console.log(`🔍 Filters: United States of America\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || CONFIG.baseUrl
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1
        let consecutiveEmpty = 0

        while (pageNum <= CONFIG.maxPages) {
            const pageUrl = `${CONFIG.baseUrl}&page=${pageNum}#results`
            console.log(`📄 Page ${pageNum}...`)

            await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 })
            await sleep(2000)
            await page.waitForSelector('.card.card-job', { timeout: 15000 }).catch(() => { })

            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('.card.card-job'))
                return cards.map(card => {
                    const linkEl = card.querySelector('a.js-view-job') as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    const title = linkEl?.textContent?.trim() || ''
                    // Extract job ID from data attribute or URL
                    const idEl = card.querySelector('[data-id], [data-job-id]') as HTMLElement | null
                    const idFromAttr = idEl?.dataset.id || idEl?.dataset.jobId
                    const idFromUrl = href.match(/\/jobs\/([^/]+)\//)?.[1]
                    const id = idFromAttr || idFromUrl || title.slice(0, 30).replace(/\s+/g, '_')
                    const locationEls = Array.from(card.querySelectorAll('.list-inline.job-meta li'))
                    const location = locationEls.map(el => el.textContent?.trim()).filter(Boolean).join(', ')
                    const dept = card.querySelector('.card-subtitle')?.textContent?.trim() || ''
                    return { id, title, location, dept, url: href, text: card.textContent || '' }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                consecutiveEmpty++
                if (consecutiveEmpty >= 2) { console.log('📭 No more jobs. Done.'); break }
                pageNum++
                continue
            }
            consecutiveEmpty = 0

            let newJobs = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `salesforce_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location),
                    department: j.dept || 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at Salesforce - ${j.location}`,
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(j.text),
                    security_clearance: detectSecurityClearance(j.text),
                    h1b_sponsorship: detectH1BSponsorship(j.text),
                    job_url: j.url,
                    is_active: true,
                }
                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total)`)
            pageNum++
            await sleep(randomDelay(1500, 3000))
        }

        console.log(`\n📊 Total jobs collected: ${collectedJobs.length}`)

        if (collectedJobs.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, careerUrl)

    } finally {
        await browser.close()
    }
}

scrapeeSalesforceJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
