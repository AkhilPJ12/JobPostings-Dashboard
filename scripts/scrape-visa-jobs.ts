/**
 * Visa Jobs Scraper
 *
 * Scrapes job listings from Visa Corporate Careers.
 * API: search.visa.com/CAREERS/careers/jobs
 * Uses Playwright for browser context.
 *
 * NOTE: Visa only posts jobs in specific cities — keeping the original URL filters.
 *
 * Usage: npx tsx scripts/scrape-visa-jobs.ts
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
    companyName: 'Visa',
    dateWindowDays: 14,
    maxPages: 20,
}

async function scrapeVisaJobs() {
    console.log(`🚀 Visa Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: Specific US cities, sorted by newest\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://corporate.visa.com/en/jobs/?cities=Ashburn&cities=Atlanta&cities=Austin&cities=Bellevue&cities=Foster&cities=Foster%20City&cities=Highlands%20Ranch&cities=Lehi&cities=Mentor&cities=Miami&cities=New%20York&cities=Oakland&cities=San%20Francisco&cities=San%20Juan&cities=Washington&cities=Wilmington&sortProperty=createdOn&sortOrder=DESC'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading Visa Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(5000)

        // Accept cookies if needed
        const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Accept All")')
        if (cookieBtn) {
            await cookieBtn.click()
            await sleep(2000)
        }

        console.log(`✅ Page loaded\n`)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let scrollCount = 0
        let previousCount = 0

        while (scrollCount < CONFIG.maxPages) {
            // Extract jobs from DOM
            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('a[href*="/en/jobs/"], [class*="job-card"], [class*="jobCard"]'))
                return cards.map(card => {
                    const link = card.closest('a') || card.querySelector('a')
                    const href = (link as HTMLAnchorElement)?.href || ''
                    const idMatch = href.match(/(REF\d+\w?)/) || href.match(/\/(\d+)(?:\?|$)/)
                    const id = idMatch ? idMatch[1] : ''
                    const title = card.querySelector('h2, h3, h4, [class*="title"]')?.textContent?.trim() ||
                        (card as HTMLElement).querySelector('[class*="heading"]')?.textContent?.trim() || ''
                    const location = card.querySelector('[class*="location"]')?.textContent?.trim() || ''
                    const date = card.querySelector('[class*="date"]')?.textContent?.trim() || ''
                    const text = card.textContent || ''

                    return { id, title, location, date, url: href, text }
                }).filter(j => j.title)
            })

            console.log(`📄 Scroll ${scrollCount + 1}: Found ${jobs.length} job elements`)

            let newJobs = 0
            for (const j of jobs) {
                if (!j.id || seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const postedDate = parsePostedDate(j.date)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `visa_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location, j.text),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: postedDate || new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at Visa - ${j.location}`,
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(j.text),
                    security_clearance: detectSecurityClearance(j.text),
                    h1b_sponsorship: detectH1BSponsorship(j.text),
                    job_url: j.url || careerUrl,
                    is_active: true,
                }
                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total)`)

            if (collectedJobs.length === previousCount && scrollCount > 1) {
                console.log('📭 No new jobs found. Done.')
                break
            }
            previousCount = collectedJobs.length

            // Load more
            const showMore = await page.$('button:has-text("Show more"), button:has-text("Load more"), [class*="load-more"]')
            if (showMore) {
                await showMore.click()
                await sleep(3000)
            } else {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await sleep(2000)
            }

            scrollCount++
            await sleep(randomDelay(2000, 4000))
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

scrapeVisaJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
