/**
 * Deloitte Jobs Scraper
 *
 * Scrapes job listings from Deloitte Careers.
 * Deloitte uses server-side rendering — DOM scraping with Playwright.
 *
 * Usage: npx tsx scripts/scrape-deloitte-jobs.ts
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
    companyName: 'Deloitte',
    dateWindowDays: 14,
    maxPages: 100,
    pageSize: 25,
}

async function scrapeDeloitteJobs() {
    console.log(`🚀 Deloitte Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: US\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://apply.deloitte.com/en_US/careers/SearchJobs/?jobSort=relevancy&jobRecordsPerPage=10&jobOffset=0'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading Deloitte Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(5000)

        // Accept cookies
        const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Accept All"), [class*="cookie-accept"]')
        if (cookieBtn) {
            await cookieBtn.click()
            await sleep(2000)
        }
        console.log(`✅ Page loaded\n`)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let offset = 0

        while (offset < CONFIG.maxPages * CONFIG.pageSize) {
            const pageNum = Math.floor(offset / CONFIG.pageSize) + 1
            console.log(`📄 Page ${pageNum} (offset=${offset})...`)

            // Navigate to the offset page
            const pageUrl = careerUrl.replace(/jobOffset=\d+/, `jobOffset=${offset}`)
            if (offset > 0) {
                await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 })
                await sleep(3000)
            }

            // Extract jobs from DOM
            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('.job-result, [class*="job-card"], [class*="jobResult"], tr[class*="job"], a[href*="JobDetail"]'))
                return cards.map(card => {
                    const link = card.querySelector('a[href*="JobDetail"]') || card.querySelector('a') || card.closest('a')
                    const href = (link as HTMLAnchorElement)?.href || ''
                    const idMatch = href.match(/\/(\d{5,6})(?:[/?]|$)/)
                    const id = idMatch ? idMatch[1] : ''
                    const title = card.querySelector('h2, h3, h4, a, [class*="title"]')?.textContent?.trim() || ''
                    const location = card.querySelector('[class*="location"]')?.textContent?.trim() || ''
                    const date = card.querySelector('[class*="date"]')?.textContent?.trim() || ''
                    const text = card.textContent || ''

                    return { id, title, location, date, url: href, text }
                }).filter(j => j.title)
            })

            if (jobs.length === 0) {
                console.log('📭 No more jobs. Done.')
                break
            }

            let newJobs = 0
            for (const j of jobs) {
                const jobId = j.id || `${j.title.replace(/\s/g, '_').slice(0, 20)}_${offset}`
                if (seenIds.has(jobId)) continue
                seenIds.add(jobId)

                const postedDate = parsePostedDate(j.date)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `deloitte_${jobId}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location, j.text),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: postedDate || new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at Deloitte - ${j.location}`,
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

            offset += CONFIG.pageSize
            const delay = randomDelay()
            console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`)
            await sleep(delay)
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

scrapeDeloitteJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
