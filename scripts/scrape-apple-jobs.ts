import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Apple Jobs Scraper
 *
 * Scrapes job listings from Apple Jobs (jobs.apple.com).
 * DOM selectors verified from live page (Mar 2026):
 *   - Cards: div.job-title.job-list-item
 *   - Title/Link: a (first anchor in card)
 *   - Team: span.team-name
 *   - Location: span.table--advanced-search__location-sub
 *   - Posted Date: span.job-posted-date
 *   - Next Page: button[aria-label="Next Page"]
 *
 * Detail page sections use h2.t-label as sidebar labels,
 * with content in the adjacent div.column.large-9.
 *
 * Usage: pnpm exec tsx scripts/scrape-apple-jobs.ts
 */

import { BrowserContext, chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'
import { noteSourceFailure } from '../lib/modules/ingestion/health'

const CONFIG = {
    companyName: 'Apple',
    dateWindowDays: 14,
    maxPages: 100,
    detailConcurrency: 4,
    listingBudgetMs: 180000,
    sourceBudgetMs: 480000,
}

type ListJob = {
    id: string
    title: string
    location: string
    dateText: string
    url: string
    team: string
}

type DetailData = {
    summary: string
    description: string
    responsibilities: string[]
    minQualifications: string[]
    prefQualifications: string[]
    payBenefits: string
}

async function fetchAppleJobDetail(context: BrowserContext, jobUrl: string): Promise<DetailData> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForSelector('h2.t-label', { timeout: 5000 })

        const sections = await page.evaluate(() => {
            const result: Record<string, { text: string; items: string[] }> = {}
            const labels = Array.from(document.querySelectorAll('h2.t-label'))
            for (const h2 of labels) {
                const label = h2.textContent?.trim() || ''
                const aside = h2.parentElement
                const row = aside?.parentElement
                const content = row?.querySelector('div.column.large-9')
                const items = Array.from(content?.querySelectorAll('li') || [])
                    .map(li => li.textContent?.trim() || '')
                    .filter(Boolean)
                const text = content?.textContent?.trim() || ''
                result[label] = { text, items }
            }
            return result
        })

        return {
            summary: sections['Summary']?.text || '',
            description: sections['Description']?.text || '',
            responsibilities: sections['Responsibilities']?.items || [],
            minQualifications: sections['Minimum Qualifications']?.items || [],
            prefQualifications: sections['Preferred Qualifications']?.items || [],
            payBenefits: sections['Pay & Benefits']?.text || '',
        }
    } catch {
        noteSourceFailure('Apple could not load one or more detail pages')
        return { summary: '', description: '', responsibilities: [], minQualifications: [], prefQualifications: [], payBenefits: '' }
    } finally {
        await page.close()
    }
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
    const deadline = Date.now() + CONFIG.sourceBudgetMs

    try {
        // ── Phase 1: collect all matching jobs from list pages ──────────────
        console.log(`📄 Loading Apple Careers page...`)
        await navigateSource(page, careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
        await sleep(5000)

        const listJobs: ListJob[] = []
        const seenIds = new Set<string>()
        let pageNum = 1
        let earlyStop = false
        const listingDeadline = Date.now() + CONFIG.listingBudgetMs

        while (pageNum <= CONFIG.maxPages && !earlyStop) {
            if (Date.now() >= listingDeadline) {
                noteSourceFailure('Apple listing scan reached its time budget; more pages may remain')
                break
            }
            console.log(`📄 Page ${pageNum}...`)

            await page.waitForSelector('div.job-title.job-list-item', { timeout: 15000 }).catch(() => { })

            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('div.job-title.job-list-item'))
                return cards.map(card => {
                    const linkEl = card.querySelector('a') as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    const idMatch = href.match(/\/details\/([^/?]+)/)
                    const id = idMatch ? idMatch[1] : ''
                    const title = linkEl?.textContent?.trim() || ''
                    const locEl = card.querySelector('span.table--advanced-search__location-sub')
                    const location = locEl?.textContent?.trim() || ''
                    const dateEl = card.querySelector('span.job-posted-date')
                    const dateText = dateEl?.textContent?.trim() || ''
                    const teamEl = card.querySelector('span.team-name')
                    const team = teamEl?.textContent?.trim() || ''
                    return { id, title, location, dateText, url: href, team }
                }).filter(j => j.id && j.title)
            })

            if (jobs.length === 0) {
                console.log(`   ⚠️  No job cards found on page ${pageNum}`)
                break
            }

            let kept = 0, skipped = 0, oldCount = 0
            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)

                const postedDate = parsePostedDate(j.dateText)
                if (!postedDate) { skipped++; continue }
                if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) { oldCount++; skipped++; continue }

                listJobs.push(j)
                kept++
            }

            console.log(`   ✅ ${kept} kept, ${skipped} date-skipped (${listJobs.length} total)`)

            if (oldCount >= jobs.length * 0.8) {
                console.log(`   📅 Most jobs older than ${CONFIG.dateWindowDays} days. Stopping.`)
                earlyStop = true
                break
            }

            const nextBtn = await page.$('button[aria-label="Next Page"]:not([disabled])')
            if (!nextBtn) { console.log('📭 No Next Page button. Done.'); break }
            await nextBtn.click()
            await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { })
            await sleep(randomDelay(2000, 4000))
            pageNum++
        }
        if (pageNum > CONFIG.maxPages && !earlyStop) {
            noteSourceFailure(`Apple listing scan reached the ${CONFIG.maxPages}-page limit`)
        }

        console.log(`\n📋 ${listJobs.length} jobs found. Fetching full details...`)

        if (listJobs.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        // ── Phase 2: fetch detail pages in parallel batches ────────────────
        let collectedCount = 0
        let writtenCount = 0
        for (let i = 0; i < listJobs.length; i += CONFIG.detailConcurrency) {
            if (Date.now() >= deadline) {
                noteSourceFailure('Apple detail scan reached its time budget; more jobs remain')
                break
            }
            const batch = listJobs.slice(i, i + CONFIG.detailConcurrency)
            console.log(`   🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, listJobs.length)} / ${listJobs.length}`)
            const results = await Promise.all(
                batch.map(j => fetchAppleJobDetail(context, j.url))
            )
            const batchJobs: DbJob[] = batch.map((j, idx) => {
                const detail = results[idx]
                const descParts: string[] = []
                if (detail.summary) descParts.push(detail.summary)
                if (detail.description) descParts.push(detail.description)
                if (detail.responsibilities.length) {
                    descParts.push('Responsibilities:\n' + detail.responsibilities.map(r => `• ${r}`).join('\n'))
                }
                const fullDescription = descParts.join('\n\n')
                return {
                    company_id: company.id,
                    external_job_id: `apple_${j.id}`,
                    title: j.title,
                    location: j.location || '',
                    location_type: determineLocationType(j.location),
                    department: normalizeDepartment(j.team || 'General', j.title),
                    employment_type: determineEmploymentType(j.title),
                    posted_date: parsePostedDate(j.dateText)!,
                    description: fullDescription || j.title,
                    summary: detail.summary || `${j.title} at Apple - ${j.location}`,
                    required_qualifications: detail.minQualifications,
                    preferred_qualifications: detail.prefQualifications,
                    pay_range: extractPayRange(detail.payBenefits || fullDescription),
                    security_clearance: detectSecurityClearance(fullDescription),
                    h1b_sponsorship: detectH1BSponsorship(fullDescription),
                    structuredSourceFields: {
                        summary: detail.summary || null,
                        department: j.team || null,
                        required_qualifications: detail.minQualifications,
                        preferred_qualifications: detail.prefQualifications,
                    },
                    sourceHints: { payBenefits: detail.payBenefits || '' },
                    job_url: j.url,
                    is_active: true,
                }
            })
            collectedCount += batchJobs.length
            writtenCount += await upsertJobsBatch(batchJobs)
            if (Date.now() < deadline) {
                await sleep(randomDelay(500, 1000))
            }
        }

        console.log(`\n📊 Total jobs processed: ${collectedCount}/${listJobs.length}`)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedCount, writtenCount, dbCount, careerUrl)

    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeAppleJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
