/**
 * Google Jobs Scraper
 *
 * Fallback policy:
 * 1) Scrape `careers_url` first
 * 2) If posted date is unavailable in job positions, try `careers_url_1`
 * 3) If still unavailable (or no careers_url_1), scrape first 20 pages and store
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Google',
    dateWindowDays: 14,
    maxPages: 150,
    maxPagesNoDate: 20,
}

type ExtractedJob = {
    id: string
    title: string
    location: string
    url: string
    text: string
    dateText: string
}

function looksLikeDate(text: string): string | null {
    if (!text) return null
    const m = text.match(/(\b\w+\s+\d{1,2},\s*\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i)
    return m ? m[1] : null
}

function buildGooglePageUrl(baseUrl: string, pageNum: number): string {
    const url = new URL(baseUrl)
    const pageIndex = Math.max(0, pageNum - 1)
    if (pageIndex === 0) return url.toString()
    url.searchParams.set('page', String(pageIndex))
    url.searchParams.set('start', String(pageIndex * 20))
    return url.toString()
}

async function runGoogleUrl(baseUrl: string, pages: number, requireDate: boolean) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        const collected: ExtractedJob[] = []
        const seenIds = new Set<string>()
        let hasAnyPostedDate = false
        let emptyPages = 0
        let zeroNewUniquePages = 0

        for (let pageNum = 1; pageNum <= pages; pageNum++) {
            const pageUrl = buildGooglePageUrl(baseUrl, pageNum)
            console.log(`📄 Google page ${pageNum}: ${pageUrl}`)

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(randomDelay(1400, 2600))

            let jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('li.lLd3Je'))
                return cards.map(card => {
                    const title = card.querySelector('h3.QJPWVe')?.textContent?.trim() || ''
                    const location = card.querySelector('span.r0wTof')?.textContent?.trim() || ''
                    const href = (card.querySelector('a.WpHeLc') as HTMLAnchorElement | null)?.href || ''
                    const idMatch = href.match(/results\/(\d+)/)
                    const id = idMatch ? idMatch[1] : `${title}_${location}`.replace(/\s+/g, '_').slice(0, 40)

                    const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [aria-label*="Posted"], [aria-label*="posted"]')
                    const dateText = dateEl?.textContent?.trim() || ''
                    return { id, title, location, url: href, text: card.textContent || '', dateText }
                }).filter(j => j.title)
            }) as ExtractedJob[]

            if (jobs.length === 0 && pageNum === 1) {
                await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 })
                await sleep(2500)
                jobs = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('li.lLd3Je'))
                    return cards.map(card => {
                        const title = card.querySelector('h3.QJPWVe')?.textContent?.trim() || ''
                        const location = card.querySelector('span.r0wTof')?.textContent?.trim() || ''
                        const href = (card.querySelector('a.WpHeLc') as HTMLAnchorElement | null)?.href || ''
                        const idMatch = href.match(/results\/(\d+)/)
                        const id = idMatch ? idMatch[1] : `${title}_${location}`.replace(/\s+/g, '_').slice(0, 40)
                        const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [aria-label*="Posted"], [aria-label*="posted"]')
                        const dateText = dateEl?.textContent?.trim() || ''
                        return { id, title, location, url: href, text: card.textContent || '', dateText }
                    }).filter(j => j.title)
                }) as ExtractedJob[]
            }

            if (jobs.length === 0) {
                emptyPages++
                if (emptyPages >= 2) break
                continue
            }
            emptyPages = 0
            console.log(`   ✅ ${jobs.length} jobs on page ${pageNum}`)
            let newUniqueThisPage = 0

            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)
                newUniqueThisPage++
                const parsed = parsePostedDate(j.dateText || looksLikeDate(j.text))
                if (parsed) hasAnyPostedDate = true
                collected.push(j)
            }

            if (requireDate && !hasAnyPostedDate && pageNum >= 3) {
                return { hasDate: false, jobs: [] as ExtractedJob[] }
            }

            if (newUniqueThisPage === 0) {
                zeroNewUniquePages++
                if (zeroNewUniquePages >= 2) break
            } else {
                zeroNewUniquePages = 0
            }
        }

        if (requireDate && !hasAnyPostedDate) {
            return { hasDate: false, jobs: [] as ExtractedJob[] }
        }

        return { hasDate: hasAnyPostedDate, jobs: collected }
    } finally {
        await browser.close()
    }
}

async function scrapeGoogleJobs() {
    console.log(`🚀 Google Jobs Scraper`)
    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const primaryUrl = company.careers_url || 'https://www.google.com/about/careers/applications/jobs/results?location=United%20States&sort_by=date&employment_type=INTERN&employment_type=TEMPORARY&employment_type=FULL_TIME'
    const fallbackUrl = company.careers_url_1

    console.log(`🔗 Primary URL: ${primaryUrl}`)
    if (fallbackUrl) console.log(`🔁 Secondary URL: ${fallbackUrl}`)

    let sourceUrl = primaryUrl
    let result = await runGoogleUrl(primaryUrl, CONFIG.maxPages, true)

    if (!result.hasDate) {
        console.log('⚠️ No posting date in primary jobs.')
        if (fallbackUrl) {
            sourceUrl = fallbackUrl
            const second = await runGoogleUrl(fallbackUrl, CONFIG.maxPages, true)
            if (second.hasDate) {
                console.log('✅ Using secondary URL with posting dates.')
                result = second
            } else {
                console.log('⚠️ Secondary URL also has no posting dates. Using first 20 pages.')
                result = await runGoogleUrl(fallbackUrl, CONFIG.maxPagesNoDate, false)
            }
        } else {
            console.log('⚠️ No secondary URL. Using first 20 pages from primary URL.')
            result = await runGoogleUrl(primaryUrl, CONFIG.maxPagesNoDate, false)
        }
    }

    const collectedJobs: DbJob[] = []
    for (const j of result.jobs) {
        const postedDate = parsePostedDate(j.dateText || looksLikeDate(j.text))
        if (result.hasDate && (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays))) {
            continue
        }

        const finalPostedDate = postedDate || new Date().toISOString().split('T')[0]
        const job: DbJob = {
            company_id: company.id,
            external_job_id: `google_${j.id}`,
            title: j.title,
            location: j.location || 'United States',
            location_type: determineLocationType(j.location),
            department: 'General',
            employment_type: determineEmploymentType(j.title),
            posted_date: finalPostedDate,
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
    }

    console.log(`📊 Total jobs collected: ${collectedJobs.length}`)
    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    console.log(`🗄️  Upserting ${collectedJobs.length} jobs...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

scrapeGoogleJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
