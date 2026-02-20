/**
 * Meta Jobs Scraper
 *
 * Scrapes job listings from Meta Careers (metacareers.com).
 * Uses URL-based pagination: ?page=N (10 jobs per page, ~84 pages)
 * Verified approach (Feb 2026):
 *   - Cards: a[href*="/profile/job_details/"]
 *   - Title: h3 inside card
 *   - Location: span with comma in text inside card
 *   - Pagination: navigate to ?page=N URLs directly
 *   - Next button: [aria-label="Button to select next week"]
 *
 * Usage: npx tsx scripts/scrape-meta-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Meta',
    dateWindowDays: 14,
    maxPages: 100,
}

async function scrapeMetaJobs() {
    console.log(`🚀 Meta Jobs Scraper`)
    console.log(`📅 Fetching jobs (sorted by newest, collecting US jobs)`)
    console.log(`🔍 Filters: North America\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const baseUrl = 'https://www.metacareers.com/jobsearch?sort_by_new=true&offices[0]=North%20America'
    console.log(`🔗 Career URL: ${baseUrl}`)

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
            const pageUrl = pageNum === 1 ? baseUrl : `${baseUrl}&page=${pageNum}`
            console.log(`📄 Page ${pageNum}...`)

            await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 })
            await sleep(3000)

            // Extract job cards
            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('a[href*="/profile/job_details/"]')) as HTMLAnchorElement[]
                return cards.map(card => {
                    const href = card.href || ''
                    const idMatch = href.match(/\/profile\/job_details\/([^/?]+)/)
                    const id = idMatch ? idMatch[1] : ''
                    const titleEl = card.querySelector('h3')
                    const title = titleEl?.textContent?.trim() || ''
                    // Find location — typically span with a comma (e.g., "Menlo Park, CA")
                    const spans = Array.from(card.querySelectorAll('span'))
                    const location = spans.find(s => (s.textContent || '').includes(','))?.textContent?.trim()
                        || spans.find(s => s.textContent?.trim())?.textContent?.trim() || ''
                    return { id, title, location, url: href, text: card.textContent || '' }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                consecutiveEmpty++
                if (consecutiveEmpty >= 2) {
                    console.log('📭 No more jobs. Done.')
                    break
                }
                pageNum++
                continue
            }
            consecutiveEmpty = 0

            let newJobs = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                // Filter for US locations
                if (j.location && !isUSLocation(j.location) && !j.location.toLowerCase().includes('remote')) {
                    continue
                }

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `meta_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at Meta - ${j.location}`,
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
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, baseUrl)

    } finally {
        await browser.close()
    }
}

scrapeMetaJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
