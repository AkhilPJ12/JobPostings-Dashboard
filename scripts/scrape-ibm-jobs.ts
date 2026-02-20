/**
 * IBM Jobs Scraper
 *
 * Scrapes job listings from IBM Careers using verified selectors (Feb 2026):
 *   - Cards: a.bx--card-group__card
 *   - Title: .bx--card__heading
 *   - Location: .ibm--card__copy__inner (last line of text)
 *   - Department: .bx--card__eyebrow
 *   - Next page: a.cds--pagination-nav__page--direction[aria-label="Next"]
 *
 * Usage: npx tsx scripts/scrape-ibm-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'IBM',
    dateWindowDays: 14,
    maxPages: 100,
}

async function scrapeIBMJobs() {
    console.log(`🚀 IBM Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: United States, sorted by date\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://www.ibm.com/careers/search?field_keyword_05[0]=United%20States&sort=dcdate_desc'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading IBM Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'load', timeout: 90000 })
        await sleep(8000) // IBM needs time to render hits

        // Accept cookies if present
        const cookieBtn = await page.$('#truste-consent-button, button:has-text("Accept all")')
        if (cookieBtn) { await cookieBtn.click(); await sleep(2000) }

        // Wait for job cards to appear
        await page.waitForSelector('a.bx--card-group__card', { timeout: 20000 }).catch(() => { })
        console.log(`✅ Page loaded\n`)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1

        while (pageNum <= CONFIG.maxPages) {
            console.log(`📄 Page ${pageNum}...`)

            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('a.bx--card-group__card')) as HTMLAnchorElement[]
                return cards.map(card => {
                    const href = card.href || ''
                    // IBM job URLs: /careers/search/job/XXXXXX
                    const idMatch = href.match(/\/job\/([^/?]+)/) || href.match(/reqId=([^&]+)/)
                    const id = idMatch ? idMatch[1] : href.split('/').filter(Boolean).pop() || ''
                    const title = card.querySelector('.bx--card__heading')?.textContent?.trim() || ''
                    // Location is in .ibm--card__copy__inner - take last non-empty line
                    const copyEl = card.querySelector('.ibm--card__copy__inner')
                    const copyLines = (copyEl?.textContent || '').split(/\n|\r/).map(s => s.trim()).filter(Boolean)
                    const location = copyLines.find(l => l.match(/,\s*[A-Z]{2}/) || l.includes('US')) || copyLines[copyLines.length - 1] || ''
                    const dept = card.querySelector('.bx--card__eyebrow')?.textContent?.trim() || 'General'
                    return { id, title, location, dept, url: href, text: card.textContent || '' }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                console.log('📭 No job cards found. Done.')
                break
            }

            let newJobs = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `ibm_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location),
                    department: j.dept || 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at IBM - ${j.location}`,
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

            // Click Next page button
            const nextBtn = await page.$('a.cds--pagination-nav__page--direction[aria-label="Next"]:not([disabled])')
            if (!nextBtn) {
                console.log('📭 No next page. Done.')
                break
            }
            await nextBtn.click()
            await page.waitForLoadState('load', { timeout: 30000 }).catch(() => { })
            await sleep(randomDelay(3000, 5000))
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

scrapeIBMJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
