/**
 * Accenture Jobs Scraper
 *
 * Scrapes job listings from Accenture Careers.
 * Accenture uses an Elastic Search API at /api/accenture/elastic/findjobs
 *
 * Usage: npx tsx scripts/scrape-accenture-jobs.ts
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
    companyName: 'Accenture',
    dateWindowDays: 14,
    maxPages: 50,
    pageSize: 20,
}

async function scrapeAccentureJobs() {
    console.log(`🚀 Accenture Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://www.accenture.com/us-en/careers/jobsearch'
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        console.log(`📄 Loading Accenture Careers page...`)
        await page.goto(careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(5000)

        // Accept cookies
        const cookieBtn = await page.$('button:has-text("Accept All"), button:has-text("Accept all")')
        if (cookieBtn) {
            await cookieBtn.click()
            await sleep(2000)
        }
        console.log(`✅ Page loaded\n`)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()

        // Try to use the Elastic API from browser context
        let pageNum = 0
        let totalHits = 0

        while (pageNum < CONFIG.maxPages) {
            console.log(`📄 Page ${pageNum + 1}...`)

            const result = await page.evaluate(async ({ pageNum, pageSize }) => {
                try {
                    const resp = await fetch('/api/accenture/elastic/findjobs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({
                            query: '',
                            country: 'USA',
                            page: pageNum,
                            size: pageSize,
                            sort: 'Newest',
                        }),
                    })
                    if (!resp.ok) return { error: `HTTP ${resp.status}`, jobs: [], total: 0 }
                    return await resp.json()
                } catch (e: unknown) {
                    return { error: String(e), jobs: [], total: 0 }
                }
            }, { pageNum, pageSize: CONFIG.pageSize }) as { error?: string; jobs?: unknown[]; total?: number; data?: unknown[]; totalHits?: number;[key: string]: unknown }

            if (result.error) {
                console.log(`   ⚠️ API error: ${result.error}, falling back to DOM scraping`)
                break
            }

            if (pageNum === 0) {
                totalHits = (result.total || result.totalHits || 0) as number
                console.log(`📊 Total matching jobs: ${totalHits}`)
            }

            const jobs = (result.jobs || result.data || []) as Record<string, unknown>[]
            if (jobs.length === 0) {
                console.log('📭 No more results. Done.')
                break
            }

            let pageCollected = 0
            for (const j of jobs) {
                const id = String(j.jobId || j.id || j.requisitionId || '')
                if (!id || seenIds.has(id)) continue
                seenIds.add(id)

                const title = String(j.title || j.jobTitle || '')
                const location = String(j.location || j.city || '')
                const desc = String(j.description || j.jobDescription || '')
                const postedDate = parsePostedDate(j.postedDate as string || j.created as string || null)

                if (postedDate && !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) continue

                const fullText = `${title} ${desc} ${location}`

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `accenture_${id}`,
                    title: title || 'Untitled',
                    location: location || 'United States',
                    location_type: determineLocationType(location, desc),
                    department: String(j.department || j.skillGroup || 'General'),
                    employment_type: determineEmploymentType(String(j.jobType || title)),
                    posted_date: postedDate || new Date().toISOString().split('T')[0],
                    description: cleanHtml(desc),
                    summary: createSummary(desc),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(desc),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: `https://www.accenture.com/us-en/careers/jobdetails?id=${id}`,
                    is_active: true,
                }
                collectedJobs.push(job)
                pageCollected++
            }

            console.log(`   ✅ ${pageCollected} collected (${collectedJobs.length} total)`)

            if (collectedJobs.length >= totalHits || jobs.length < CONFIG.pageSize) {
                console.log('📭 All results processed. Done.')
                break
            }

            pageNum++
            const delay = randomDelay()
            console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`)
            await sleep(delay)
        }

        // If API didn't work, fall back to DOM scraping
        if (collectedJobs.length === 0) {
            console.log('\n🔄 Falling back to DOM scraping...')
            let scrollCount = 0
            let prevCount = 0

            while (scrollCount < CONFIG.maxPages) {
                const domJobs = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('[class*="job-card"], [class*="jobCard"], .cmp-teaser'))
                    return cards.map(card => {
                        const title = card.querySelector('h3, h4, [class*="title"]')?.textContent?.trim() || ''
                        const loc = card.querySelector('[class*="location"]')?.textContent?.trim() || ''
                        const link = (card.querySelector('a') as HTMLAnchorElement)?.href || ''
                        const idMatch = link.match(/(\d{6,7})/)
                        return { id: idMatch?.[1] || '', title, location: loc, url: link, text: card.textContent || '' }
                    }).filter(j => j.title)
                })

                let newJobs = 0
                for (const j of domJobs) {
                    if (!j.id || seenIds.has(j.id)) continue
                    seenIds.add(j.id)

                    const job: DbJob = {
                        company_id: company.id,
                        external_job_id: `accenture_${j.id}`,
                        title: j.title,
                        location: j.location || 'United States',
                        location_type: determineLocationType(j.location, j.text),
                        department: 'General',
                        employment_type: determineEmploymentType(j.title),
                        posted_date: new Date().toISOString().split('T')[0],
                        description: cleanHtml(j.text),
                        summary: `${j.title} at Accenture`,
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

                console.log(`   Scroll ${scrollCount + 1}: ${newJobs} new (${collectedJobs.length} total)`)

                if (collectedJobs.length === prevCount && scrollCount > 2) break
                prevCount = collectedJobs.length

                const showMore = await page.$('button:has-text("Show more"), [class*="load-more"]')
                if (showMore) { await showMore.click(); await sleep(3000) }
                else { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(2000) }

                scrollCount++
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

scrapeAccentureJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
