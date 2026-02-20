/**
 * JPMorgan Chase Jobs Scraper
 *
 * Scrapes job listings from JPMorgan Chase Careers (Oracle HCM Cloud).
 * Uses Playwright to access the Oracle HCM candidate experience portal.
 *
 * Usage: npx tsx scripts/scrape-jpmorgan-jobs.ts
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
    companyName: 'JPMorgan Chase',
    dateWindowDays: 14,
    maxPages: 100,
}

async function scrapeJPMorganJobs() {
    console.log(`🚀 JPMorgan Chase Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: United States, posted in last 30 days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs?lastSelectedFacet=POSTING_DATES&location=United+States&locationId=300000000289738&locationLevel=country&mode=location&selectedPostingDatesFacet=30'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading JPMorgan Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(8000) // Oracle HCM takes long to render

        // Accept privacy notice if present
        const privacyBtn = await page.$('button:has-text("Confirm"), button:has-text("Accept"), button:has-text("OK")')
        if (privacyBtn) {
            await privacyBtn.click()
            await sleep(3000)
        }

        console.log(`✅ Page loaded\n`)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1
        let consecutiveEmpty = 0

        while (pageNum <= CONFIG.maxPages) {
            console.log(`📄 Page ${pageNum}...`)

            // Extract jobs from Oracle HCM DOM
            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('[class*="job-card"], [class*="requisition"], a[href*="/requisition/"]'))
                return cards.map(card => {
                    const link = card.querySelector('a') || card.closest('a')
                    const href = (link as HTMLAnchorElement)?.href || ''
                    const idMatch = href.match(/\/(\d{9,})/)
                    const id = idMatch ? idMatch[1] : ''
                    const title = card.querySelector('h2, h3, [class*="title"], [class*="Title"]')?.textContent?.trim() || ''
                    const location = card.querySelector('[class*="location"], [class*="Location"]')?.textContent?.trim() || ''
                    const date = card.querySelector('[class*="date"], [class*="Date"]')?.textContent?.trim() || ''
                    const text = card.textContent || ''

                    return { id, title, location, date, url: href, text }
                }).filter(j => j.title)
            })

            if (jobs.length === 0) {
                // Try alternate Oracle HCM selector
                const altJobs = await page.evaluate(() => {
                    const items = Array.from(document.querySelectorAll('li[class*="job"], div[class*="job"]'))
                    return items.map(item => {
                        const titleEl = item.querySelector('h1, h2, h3, a')
                        const title = titleEl?.textContent?.trim() || ''
                        const link = item.querySelector('a')
                        const href = (link as HTMLAnchorElement)?.href || ''
                        const idMatch = href.match(/\/(\d+)/)
                        const loc = item.querySelector('[class*="loc"]')?.textContent?.trim() || ''
                        return { id: idMatch?.[1] || '', title, location: loc, date: '', url: href, text: item.textContent || '' }
                    }).filter(j => j.title)
                })

                if (altJobs.length === 0) {
                    consecutiveEmpty++
                    if (consecutiveEmpty >= 2) {
                        console.log('📭 No more jobs found. Done.')
                        break
                    }
                }

                for (const j of altJobs) {
                    if (!j.id || seenIds.has(j.id)) continue
                    seenIds.add(j.id)

                    const job: DbJob = {
                        company_id: company.id,
                        external_job_id: `jpmorgan_${j.id}`,
                        title: j.title,
                        location: j.location || 'United States',
                        location_type: determineLocationType(j.location, j.text),
                        department: 'General',
                        employment_type: determineEmploymentType(j.title),
                        posted_date: new Date().toISOString().split('T')[0],
                        description: cleanHtml(j.text),
                        summary: `${j.title} at JPMorgan Chase`,
                        required_qualifications: [],
                        preferred_qualifications: [],
                        pay_range: extractPayRange(j.text),
                        security_clearance: detectSecurityClearance(j.text),
                        h1b_sponsorship: detectH1BSponsorship(j.text),
                        job_url: j.url || careerUrl,
                        is_active: true,
                    }
                    collectedJobs.push(job)
                }
            } else {
                consecutiveEmpty = 0
                let newJobs = 0
                for (const j of jobs) {
                    if (!j.id || seenIds.has(j.id)) continue
                    seenIds.add(j.id)

                    const postedDate = parsePostedDate(j.date)
                    if (postedDate && !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) continue

                    const job: DbJob = {
                        company_id: company.id,
                        external_job_id: `jpmorgan_${j.id}`,
                        title: j.title,
                        location: j.location || 'United States',
                        location_type: determineLocationType(j.location, j.text),
                        department: 'General',
                        employment_type: determineEmploymentType(j.title),
                        posted_date: postedDate || new Date().toISOString().split('T')[0],
                        description: cleanHtml(j.text),
                        summary: `${j.title} at JPMorgan Chase - ${j.location}`,
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
            }

            // Navigate to next page
            const nextBtn = await page.$('[aria-label="Next"], button:has-text("Next"), [class*="next-page"]')
            if (nextBtn) {
                await nextBtn.click()
                await sleep(randomDelay(3000, 6000))
                pageNum++
            } else {
                // Try scrolling to load more
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await sleep(3000)
                pageNum++

                if (pageNum > 3 && collectedJobs.length === 0) {
                    console.log('📭 Could not find job elements. Done.')
                    break
                }
            }
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

scrapeJPMorganJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
