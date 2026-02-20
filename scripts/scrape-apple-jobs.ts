/**
 * Apple Jobs Scraper
 *
 * Scrapes job listings from Apple Jobs (jobs.apple.com).
 * DOM selectors verified from live page (Feb 2026):
 *   - Cards: li.rc-accordion-item
 *   - Title/Link: a.link-inline.t-intro
 *   - Location: span.table--advanced-search__location-sub
 *   - Posted Date: span.job-posted-date
 *   - Next Page: button[aria-label="Next Page"]
 *
 * Usage: npx tsx scripts/scrape-apple-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Apple',
    dateWindowDays: 14,
    maxPages: 100,
}

async function scrapeAppleJobs() {
    console.log(`🚀 Apple Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://jobs.apple.com/en-us/search?location=united-states-USA'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading Apple Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(5000)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1
        let earlyStopDueToOldJobs = false

        while (pageNum <= CONFIG.maxPages && !earlyStopDueToOldJobs) {
            console.log(`📄 Page ${pageNum}...`)

            // Wait for job cards to appear
            await page.waitForSelector('li.rc-accordion-item', { timeout: 15000 }).catch(() => { })

            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('li.rc-accordion-item'))
                return cards.map(card => {
                    const linkEl = card.querySelector('a.link-inline.t-intro') as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    const idMatch = href.match(/\/details\/([^/?]+)/)
                    const id = idMatch ? idMatch[1] : ''
                    const title = linkEl?.textContent?.trim() || ''
                    const locEl = card.querySelector('span.table--advanced-search__location-sub')
                    const location = locEl?.textContent?.trim() || ''
                    const dateEl = card.querySelector('span.job-posted-date')
                    const dateText = dateEl?.textContent?.trim() || ''
                    return { id, title, location, dateText, url: href, text: card.textContent || '' }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                console.log(`   ⚠️  No job cards found on page ${pageNum}`)
                break
            }

            let newJobs = 0
            let skipped = 0
            let oldJobCount = 0

            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const postedDate = parsePostedDate(j.dateText)
                if (postedDate && !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    oldJobCount++
                    skipped++
                    continue
                }

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `apple_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: postedDate || new Date().toISOString().split('T')[0],
                    description: j.text,
                    summary: `${j.title} at Apple - ${j.location}`,
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

            console.log(`   ✅ ${newJobs} new, ${skipped} date-skipped (${collectedJobs.length} total)`)

            // If most jobs on this page are older than 14 days, stop
            if (oldJobCount >= jobs.length * 0.8) {
                console.log(`   📅 Most jobs are older than ${CONFIG.dateWindowDays} days. Stopping.`)
                earlyStopDueToOldJobs = true
                break
            }

            // Click Next Page button
            const nextBtn = await page.$('button[aria-label="Next Page"]:not([disabled])')
            if (!nextBtn) {
                console.log('📭 No enabled Next Page button found. Done.')
                break
            }
            await nextBtn.click()
            await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { })
            await sleep(randomDelay(2000, 4000))
            pageNum++
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

scrapeAppleJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
