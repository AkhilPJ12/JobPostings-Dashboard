/**
 * Google Jobs Scraper
 *
 * Scrapes job listings from Google Careers.
 * Uses Playwright with correct DOM selectors (verified Feb 2026):
 *   - Cards: li.lLd3Je
 *   - Title: h3.QJPWVe
 *   - Location: span.r0wTof
 *   - Link: a.WpHeLc
 *   - Next page: a[aria-label="Go to next page"]
 *
 * Usage: npx tsx scripts/scrape-google-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Google',
    dateWindowDays: 14,
    maxPages: 150,
}

async function scrapeGoogleJobs() {
    console.log(`🚀 Google Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA, sorted by date\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://www.google.com/about/careers/applications/jobs/results?location=United%20States&sort_by=date&employment_type=INTERN&employment_type=TEMPORARY&employment_type=FULL_TIME'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading Google Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(3000)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1

        while (pageNum <= CONFIG.maxPages) {
            console.log(`📄 Page ${pageNum}...`)

            // Extract job cards using verified selectors
            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('li.lLd3Je'))
                return cards.map(card => {
                    const titleEl = card.querySelector('h3.QJPWVe')
                    const title = titleEl?.textContent?.trim() || ''
                    const locEl = card.querySelector('span.r0wTof')
                    const location = locEl?.textContent?.trim() || ''
                    const linkEl = card.querySelector('a.WpHeLc') as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    // Extract ID from URL path
                    const idMatch = href.match(/results\/(\d+)/)
                    const id = idMatch ? idMatch[1] : `${title}_${location}`.replace(/\s+/g, '_').slice(0, 40)
                    return { id, title, location, url: href, text: card.textContent || '' }
                }).filter(j => j.title)
            })

            if (jobs.length === 0) {
                console.log('📭 No job cards found on page. Done.')
                break
            }

            let newJobs = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `google_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at Google - ${j.location}`,
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

            // Click "Go to next page"
            const nextBtn = await page.$('a[aria-label="Go to next page"]')
            if (!nextBtn) {
                console.log('📭 No next page button. Done.')
                break
            }

            await nextBtn.click()
            await page.waitForLoadState('networkidle', { timeout: 30000 })
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

scrapeGoogleJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
