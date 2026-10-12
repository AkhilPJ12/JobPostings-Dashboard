import { navigateSource } from '../lib/modules/ingestion/browser'
import { noteSourceFailure } from '../lib/modules/ingestion/health'
/**
 * Wells Fargo Jobs Scraper
 *
 * Scrapes job listings from wellsfargojobs.com.
 * List page: paginated via ?page=N, 20 jobs per page, cards with `div.card.card-job`.
 * Detail page: has date (DD Mon YYYY), location, department, description.
 *
 * Strategy: Collect job URLs from list pages, then batch-fetch detail pages
 * for posted dates and full descriptions. Only keep jobs within 14 days.
 *
 * Usage: pnpm exec tsx scripts/scrape-wellsfargo-jobs.ts
 */

import { BrowserContext, chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate, extractPayRange, parseDayMonthYear,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Wellsfargo',
    dateWindowDays: 14,
    maxPages: 12, // Keep listing and detail work inside the ten-minute source deadline.
    detailConcurrency: 4,
}

type ListJob = { url: string; title: string }

type DetailData = {
    title: string
    location: string
    department: string
    timeType: string
    postedDate: string | null
    jobId: string
    description: string
}


async function fetchWFDetail(context: BrowserContext, jobUrl: string): Promise<DetailData | null> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await sleep(randomDelay(2000, 4000))

        return await page.evaluate(() => {
            const body = document.body.innerText || ''
            const lines = body.split('\n').map(l => l.trim()).filter(Boolean)

            // Title is in the main heading
            const titleEl = document.querySelector('h1')
            const title = titleEl?.textContent?.trim() || ''

            // After the title: LOCATION, Department, Time type, Date, Job ID
            // Pattern: title line, then location, dept, time, date, jobid on separate lines
            const titleIdx = lines.findIndex(l => l === title)
            let location = '', department = '', timeType = '', dateStr = '', jobId = ''

            if (titleIdx >= 0) {
                // Scan the next few lines after title for metadata
                for (let i = titleIdx + 1; i < Math.min(titleIdx + 10, lines.length); i++) {
                    const line = lines[i]
                    if (/^R-\d+/.test(line)) { jobId = line; continue }
                    if (/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(line)) { dateStr = line; continue }
                    if (/^(Full time|Part time|Contract|Temporary)$/i.test(line)) { timeType = line; continue }
                    if (!location && /[A-Z]{2,}/.test(line) && line.length < 50) { location = line; continue }
                    if (!department && line.length < 40 && !line.includes('Save') && !line.includes('Apply')) { department = line; continue }
                    if (line.includes('Job Description') || line.includes('Why Wells Fargo')) break
                }
            }

            // Description
            const descStart = body.indexOf('Job Description')
            const descAlt = body.indexOf('Why Wells Fargo')
            const start = descStart > -1 ? descStart : descAlt
            const desc = start > -1 ? body.slice(start, start + 3000).trim() : ''

            return { title, location, department, timeType, postedDate: dateStr || null, jobId, description: desc.slice(0, 2000) }
        })
    } catch {
        return null
    } finally {
        await page.close()
    }
}

async function scrapeWellsFargoJobs() {
    console.log(`🚀 Wells Fargo Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)
    const deadline = Date.now() + 8 * 60_000

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        // Phase 1: Collect job URLs from list pages
        console.log('📋 Phase 1: Collecting job URLs from list pages...')
        const jobUrls: ListJob[] = []
        const seenUrls = new Set<string>()
        let hitPageLimit = false

        for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
            if (Date.now() >= deadline) {
                noteSourceFailure('Wells Fargo stopped before the source deadline; listing scan is incomplete')
                break
            }
            const url = pageNum === 1
                ? 'https://www.wellsfargojobs.com/en/jobs/?search=&country=United+States+of+America'
                : `https://www.wellsfargojobs.com/en/jobs/?page=${pageNum}&country=United+States+of+America`

            console.log(`📄 Page ${pageNum}...`)
            const page = await context.newPage()
            await navigateSource(page, url, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(randomDelay(3000, 6000))

            const links = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('div.card.card-job'))
                return cards.map(card => {
                    const a = card.querySelector('h2.card-title a') as HTMLAnchorElement
                    return { url: a?.href || '', title: a?.textContent?.trim() || '' }
                }).filter(j => j.url && j.title)
            })
            await page.close()

            if (links.length === 0) {
                console.log('   📭 No jobs. Done.')
                break
            }

            let added = 0
            for (const l of links) {
                if (!seenUrls.has(l.url)) {
                    seenUrls.add(l.url)
                    jobUrls.push(l)
                    added++
                }
            }
            console.log(`   ✅ ${added} new (${jobUrls.length} total)`)
            if (added === 0) break
            if (pageNum === CONFIG.maxPages) hitPageLimit = true
        }

        if (hitPageLimit) {
            noteSourceFailure(`Wells Fargo listing scan stopped after ${CONFIG.maxPages} pages; more listings may remain`)
        }

        console.log(`\n📋 ${jobUrls.length} job URLs collected. Fetching details...`)

        if (jobUrls.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        // Phase 2: Fetch detail pages
        let collectedCount = 0
        let writtenCount = 0
        let dateSkipped = 0
        let noDate = 0
        let consecutiveOld = 0

        for (let i = 0; i < jobUrls.length; i += CONFIG.detailConcurrency) {
            if (Date.now() >= deadline) {
                noteSourceFailure('Wells Fargo stopped before the source deadline; detail scan is incomplete')
                break
            }
            const batch = jobUrls.slice(i, i + CONFIG.detailConcurrency)
            console.log(`🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, jobUrls.length)} / ${jobUrls.length}`)

            const details = await Promise.all(
                batch.map(j => fetchWFDetail(context, j.url))
            )

            let batchNew = 0
            const batchJobs: DbJob[] = []
            for (let k = 0; k < batch.length; k++) {
                const d = details[k]
                if (!d) {
                    noteSourceFailure('Some Wells Fargo detail pages could not be fetched')
                    noDate++
                    continue
                }
                if (!d.postedDate) { noDate++; continue }

                const postedDate = parseDayMonthYear(d.postedDate)
                if (!postedDate) { noDate++; continue }
                if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                batchNew++
                const title = d.title || batch[k].title
                const fullText = [title, d.location, d.description].join('\n')

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `wellsfargo_${d.jobId || batch[k].url.match(/r-(\d+)/)?.[1] || ''}`,
                    title: title.slice(0, 250),
                    location: (d.location || 'United States').slice(0, 250),
                    location_type: determineLocationType(d.location, d.description),
                    department: normalizeDepartment(d.department || 'General', title),
                    employment_type: determineEmploymentType(d.timeType || title),
                    posted_date: postedDate,
                    description: d.description || `${title} at Wells Fargo - ${d.location}`,
                    summary: `${title} at Wells Fargo - ${d.location}`.slice(0, 250),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(fullText),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: batch[k].url,
                    is_active: true,
                }
                batchJobs.push(job)
            }

            if (batchJobs.length > 0) {
                collectedCount += batchJobs.length
                writtenCount += await upsertJobsBatch(batchJobs)
            }

            // Early stop if many consecutive batches have no new jobs
            if (batchNew === 0) consecutiveOld++
            else consecutiveOld = 0
            if (consecutiveOld >= 5) {
                console.log('📭 5 consecutive batches with no recent jobs. Stopping early.')
                break
            }

            await sleep(randomDelay(300, 800))
        }

        console.log(`\n📊 Total: ${collectedCount} jobs (${dateSkipped} date-skipped, ${noDate} no-date)`)

        if (collectedCount === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedCount, writtenCount, dbCount,
            company.careers_url || 'https://www.wellsfargojobs.com/en/jobs/')
    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeWellsFargoJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
