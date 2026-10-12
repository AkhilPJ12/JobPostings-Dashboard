import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Texas Instruments Jobs Scraper
 *
 * Scrapes job listings from Oracle HCM careers site (careers.ti.com).
 * List page: div.search-results.job-tile.job-list-item cards with MM/DD/YYYY dates
 * Detail page: Full description + qualifications
 *
 * Usage: pnpm exec tsx scripts/scrape-ti-jobs.ts
 */

import { BrowserContext, chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, extractPayRange, truncateField, parseSlashDate,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Texas Instruments',
    dateWindowDays: 14,
    detailConcurrency: 3,
}

type ListJob = {
    id: string
    title: string
    location: string
    postedDate: string
    url: string
}

async function fetchTIJobDetail(context: BrowserContext, jobUrl: string): Promise<{
    description: string
    qualifications: { required: string[]; preferred: string[] }
}> {
    const page = await context.newPage()
    try {
        await navigateSource(page, jobUrl, { waitUntil: 'networkidle', timeout: 30000 })
        await sleep(randomDelay(800, 1500))

        const detail = await page.evaluate(() => {
            const body = document.body.innerText || ''
            return body
        })

        // Parse sections from the detail text
        const descMatch = detail.match(/JOB DESCRIPTION\s*([\s\S]*?)(?=QUALIFICATIONS|$)/i)
        const qualMatch = detail.match(/QUALIFICATIONS\s*([\s\S]*?)(?=Apply Now|$)/i)

        const description = descMatch?.[1]?.trim() || ''
        const qualText = qualMatch?.[1]?.trim() || ''

        // Split qualifications into required/preferred
        const required: string[] = []
        const preferred: string[] = []
        let current = required

        for (const line of qualText.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            if (/preferred/i.test(trimmed)) { current = preferred; continue }
            if (/minimum|required/i.test(trimmed)) { current = required; continue }
            if (trimmed.length > 10) current.push(trimmed)
        }

        return { description, qualifications: { required, preferred } }
    } catch {
        return { description: '', qualifications: { required: [], preferred: [] } }
    } finally {
        await page.close()
    }
}

async function scrapeTIJobs() {
    console.log(`🚀 Texas Instruments Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const urls = [company.careers_url, company.careers_url_1].filter(Boolean) as string[]
    if (urls.length === 0) {
        console.error('❌ No careers URL')
        return
    }

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })

    try {
        const allJobs: DbJob[] = []

        for (const [urlIdx, careerUrl] of urls.entries()) {
            if (urlIdx > 0) console.log(`\n🔗 Scraping secondary URL (careers_url_1)...`)
            console.log(`🔗 Career URL: ${careerUrl}`)

            const page = await context.newPage()
            await navigateSource(page, careerUrl, { waitUntil: 'networkidle', timeout: 60000 })
            await sleep(8000)

            // Collect all jobs from list page (scroll/paginate)
            const listJobs: ListJob[] = []
            const seenIds = new Set<string>()

            // TI uses infinite scroll or "Show More" - check
            let prevCount = 0
            for (let attempt = 0; attempt < 10; attempt++) {
                const jobs = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('div.search-results.job-tile.job-list-item'))
                    return cards.map(card => {
                        const tile = card as HTMLElement
                        const linkEl = tile.querySelector('a[href*=job]') as HTMLAnchorElement | null
                        const href = linkEl?.href || ''
                        const idMatch = href.match(/\/job\/(\d+)/)
                        const id = idMatch?.[1] || ''
                        const fullText = tile.innerText || tile.textContent || ''
                        // Title is first meaningful line
                        const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)
                        const title = lines[0] || ''
                        // Location: text between title and POSTING DATE
                        const locMatch = fullText.match(/\n([\s\S]*?)(?:POSTING DATE|Posting Date)/i)
                        const locText = locMatch?.[1]?.replace(/Locations?\s*/i, '').trim() || ''
                        const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/)
                        const date = dateMatch?.[1] || ''
                        return { id, title, location: locText, date, url: href }
                    }).filter(j => j.id && j.title)
                })

                for (const j of jobs) {
                    if (seenIds.has(j.id)) continue
                    seenIds.add(j.id)
                    const postedDate = parseSlashDate(j.date)
                    if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) continue
                    // Strip search params from detail URL to avoid loading issues
                    const cleanUrl = j.url.split('?')[0]
                    listJobs.push({ id: j.id, title: j.title, location: j.location, postedDate, url: cleanUrl })
                }

                if (jobs.length === prevCount) break
                prevCount = jobs.length

                // Try scrolling to load more
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
                await sleep(2000)

                // Try clicking "Show More" button
                const showMore = await page.$('button[class*=show-more], button[class*=load-more], [class*=pagination] button')
                if (showMore) {
                    await showMore.click()
                    await sleep(3000)
                }
            }

            console.log(`📋 ${listJobs.length} jobs within ${CONFIG.dateWindowDays} days`)
            await page.close()

            if (listJobs.length === 0) continue

            // Fetch details in parallel batches
            console.log(`🔍 Fetching detail pages...`)
            for (let i = 0; i < listJobs.length; i += CONFIG.detailConcurrency) {
                const batch = listJobs.slice(i, i + CONFIG.detailConcurrency)
                console.log(`   🔍 Details ${i + 1}–${Math.min(i + CONFIG.detailConcurrency, listJobs.length)} / ${listJobs.length}`)
                const details = await Promise.all(
                    batch.map(j => fetchTIJobDetail(context, j.url))
                )

                for (let k = 0; k < batch.length; k++) {
                    const j = batch[k]
                    const d = details[k]
                    const fullText = [j.title, j.location, d.description].filter(Boolean).join('\n')

                    const job: DbJob = {
                        company_id: company.id,
                        external_job_id: `ti_${j.id}`,
                        title: truncateField(j.title),
                        location: truncateField(j.location || 'United States'),
                        location_type: determineLocationType(j.location, d.description),
                        department: normalizeDepartment('General', j.title),
                        employment_type: determineEmploymentType(j.title),
                        posted_date: j.postedDate,
                        description: d.description || `${j.title} at Texas Instruments - ${j.location}`,
                        summary: truncateField(`${j.title} at Texas Instruments - ${j.location}`),
                        required_qualifications: d.qualifications.required,
                        preferred_qualifications: d.qualifications.preferred,
                        pay_range: truncateField(extractPayRange(fullText)),
                        security_clearance: detectSecurityClearance(fullText),
                        h1b_sponsorship: detectH1BSponsorship(fullText),
                        job_url: truncateField(j.url),
                        is_active: true,
                    }
                    allJobs.push(job)
                }

                await sleep(randomDelay(500, 1000))
            }
        }

        console.log(`\n📊 Total jobs collected: ${allJobs.length}`)
        if (allJobs.length === 0) {
            console.log('⚠️  No jobs found.')
            return
        }

        console.log(`\n🗄️  Upserting ${allJobs.length} jobs into Supabase...`)
        const upsertedCount = await upsertJobsBatch(allJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, allJobs.length, upsertedCount, dbCount, urls[0])

    } finally {
        await browser.close()
    }
}

withScraperRun(CONFIG.companyName, scrapeTIJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
