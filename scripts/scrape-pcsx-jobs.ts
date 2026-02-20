/**
 * PCSX Platform Scraper (Eightfold.ai)
 *
 * Shared scraper for companies using the Eightfold PCSX career platform:
 * - Microsoft (apply.careers.microsoft.com)
 * - Nvidia (nvidia.eightfold.ai)
 *
 * Uses Playwright to load each page of results via URL-based pagination.
 *
 * Usage:
 *   npx tsx scripts/scrape-pcsx-jobs.ts microsoft
 *   npx tsx scripts/scrape-pcsx-jobs.ts nvidia
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange, parseQualifications,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

// ─── Company Configs ─────────────────────────────────────────────────────────

interface PCSXConfig {
    companyName: string
    baseUrl: string
    jobUrlBase: string
    pageSize: number
    maxPages: number
    dateWindowDays: number
    /** Build the paginated URL for a given start offset */
    buildUrl: (careerUrl: string, start: number) => string
}

const CONFIGS: Record<string, PCSXConfig> = {
    microsoft: {
        companyName: 'Microsoft',
        baseUrl: 'https://apply.careers.microsoft.com',
        jobUrlBase: 'https://apply.careers.microsoft.com/careers/job/',
        pageSize: 20,
        maxPages: 100,
        dateWindowDays: 14,
        buildUrl: (careerUrl, start) => {
            const url = new URL(careerUrl)
            url.searchParams.set('start', String(start))
            return url.toString()
        },
    },
    nvidia: {
        companyName: 'Nvidia',
        baseUrl: 'https://nvidia.eightfold.ai',
        jobUrlBase: 'https://nvidia.eightfold.ai/careers?pid=',
        pageSize: 20,
        maxPages: 100,
        dateWindowDays: 14,
        buildUrl: (careerUrl, start) => {
            const url = new URL(careerUrl)
            url.searchParams.set('start', String(start))
            return url.toString()
        },
    },
}

// ─── Main Scraper ────────────────────────────────────────────────────────────

async function scrapePCSXJobs(companyKey: string) {
    const config = CONFIGS[companyKey]
    if (!config) {
        console.error(`❌ Unknown company: ${companyKey}`)
        console.error(`   Available: ${Object.keys(CONFIGS).join(', ')}`)
        process.exit(1)
    }

    console.log(`🚀 ${config.companyName} Jobs Scraper (PCSX/Eightfold)`)
    console.log(`📅 Fetching jobs posted in the last ${config.dateWindowDays} days`)
    console.log(`🔍 Filters: USA only`)
    console.log(`🗄️  Target: Supabase database\n`)

    const company = await getCompany(config.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || config.baseUrl
    console.log(`🔗 Career URL: ${careerUrl}`)

    console.log(`\n🌐 Launching browser...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let start = 0
        let pageNum = 1
        let consecutiveEmptyPages = 0

        while (pageNum <= config.maxPages) {
            const pageUrl = config.buildUrl(careerUrl, start)
            console.log(`📄 Page ${pageNum} (start=${start})...`)

            await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 })
            await sleep(3000)

            // Extract jobs from DOM
            const jobs = await page.evaluate(() => {
                // Eightfold renders job cards with various selectors
                const selectors = [
                    'a[href*="/careers/job/"]',
                    'a[href*="pid="]',
                    '[class*="position-card"]',
                    '[class*="job-card"]',
                    '[id*="job-card"]',
                ]

                let cards: Element[] = []
                for (const sel of selectors) {
                    const found = Array.from(document.querySelectorAll(sel))
                    if (found.length > cards.length) cards = found
                }

                return cards.map(card => {
                    const link = card.querySelector('a') || card.closest('a')
                    const href = (link as HTMLAnchorElement)?.href || ''
                    const idMatch = href.match(/(?:job\/|pid=)(\d+)/) || href.match(/\/(\d{10,})/)
                    const id = idMatch ? idMatch[1] : card.id?.replace(/\D/g, '') || ''
                    const titleEl = card.querySelector('h2, h3, h4, [class*="title"], [class*="Title"]')
                    const title = titleEl?.textContent?.trim() || ''
                    const locEl = card.querySelector('[class*="location"], [class*="Location"], [class*="subtitle"]')
                    const location = locEl?.textContent?.trim() || ''
                    const dateEl = card.querySelector('[class*="date"], [class*="Date"], [class*="posted"]')
                    const dateText = dateEl?.textContent?.trim() || ''

                    return { id, title, location, dateText, url: href, text: card.textContent || '' }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                consecutiveEmptyPages++
                if (consecutiveEmptyPages >= 2) {
                    console.log('📭 No more jobs found. Done.')
                    break
                }
                start += config.pageSize
                pageNum++
                continue
            }

            consecutiveEmptyPages = 0
            let newJobs = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                // Filter US locations
                if (j.location && !isUSLocation(j.location) && !j.location.includes('Multiple')) {
                    continue
                }

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `${companyKey}_${j.id}`,
                    title: j.title,
                    location: j.location || 'United States',
                    location_type: determineLocationType(j.location, j.text),
                    department: 'General',
                    employment_type: determineEmploymentType(j.title),
                    posted_date: new Date().toISOString().split('T')[0],
                    description: cleanHtml(j.text),
                    summary: `${j.title} at ${config.companyName} - ${j.location}`,
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(j.text),
                    security_clearance: detectSecurityClearance(j.text),
                    h1b_sponsorship: detectH1BSponsorship(j.text),
                    job_url: j.url || `${config.jobUrlBase}${j.id}`,
                    is_active: true,
                }
                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total)`)

            start += config.pageSize
            pageNum++

            const delay = randomDelay()
            console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`)
            await sleep(delay)
        }

        console.log(`\n📊 Total jobs collected: ${collectedJobs.length}`)

        if (collectedJobs.length === 0) {
            console.log('⚠️  No jobs found. Check career URL and filters.')
            return
        }

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(config.companyName, collectedJobs.length, upsertedCount, dbCount, company.careers_url || config.baseUrl)

    } finally {
        await browser.close()
    }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const companyArg = process.argv[2]?.toLowerCase()
if (!companyArg) {
    console.error('Usage: npx tsx scripts/scrape-pcsx-jobs.ts <microsoft|nvidia>')
    process.exit(1)
}

scrapePCSXJobs(companyArg).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
