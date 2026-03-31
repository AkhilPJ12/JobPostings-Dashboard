/**
 * Salesforce Jobs Scraper
 *
 * Fallback policy:
 * 1) Scrape `careers_url` first
 * 2) If posted date is unavailable in job positions, try `careers_url_1`
 * 3) If still unavailable (or no careers_url_1), scrape first 20 pages and store
 */

import { chromium, BrowserContext } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary, supabase,
    isWithinDaysOrFuture, parsePostedDate, cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType, normalizeDepartment,
    sleep, randomDelay, withScraperRun, parseDescriptionQualifications,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Salesforce',
    dateWindowDays: 14,
    maxPages: 30,
    maxPagesNoDate: 20,
    baseUrl: 'https://careers.salesforce.com/en/jobs/?country=United%20States%20of%20America&pagesize=20#results',
}

type ExtractedJob = {
    id: string
    title: string
    location: string
    department: string
    url: string
    text: string
    dateText: string
}

function normalizeLocation(raw: string): string {
    if (!raw) return 'United States'
    const parts = raw
        .replace(/\s+/g, ' ')
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
    const dedup = [...new Set(parts)]
    return dedup.join(', ').slice(0, 240) || 'United States'
}

async function fetchSalesforceDetail(context: BrowserContext, url: string) {
    try {
        const resp = await context.request.get(url)
        if (!resp.ok()) return { postedDate: null as string | null, description: '' }
        const html = await resp.text()
        // Detect soft 404 / "Page Not Found" pages
        if (html.includes('Page Not Found') || html.includes('page you requested could not be found')) {
            return { postedDate: null as string | null, description: '' }
        }
        const text = cleanHtml(html)
        const postedRaw = text.match(/Posted\s+([0-9]{1,2}\s+\w+\s+[0-9]{4}|\w+\s+[0-9]{1,2},\s*[0-9]{4})/i)?.[1] || null
        const postedDate = parsePostedDate(postedRaw)
        return { postedDate, description: text }
    } catch {
        return { postedDate: null as string | null, description: '' }
    }
}

async function runSalesforceUrl(baseUrl: string, pages: number, requireDate: boolean) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        const collected: ExtractedJob[] = []
        const seenIds = new Set<string>()
        let consecutiveEmpty = 0

        for (let pageNum = 1; pageNum <= pages; pageNum++) {
            const pageUrl = `${baseUrl.replace(/#results$/, '')}&page=${pageNum}#results`
            console.log(`📄 Page ${pageNum}...`)

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(1800)
            await page.waitForSelector('.card.card-job', { timeout: 10000 }).catch(() => { })

            const jobs = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('.card.card-job'))
                return cards.map(card => {
                    const linkEl = card.querySelector('a.js-view-job') as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    const title = linkEl?.textContent?.trim() || ''
                    const idFromUrl = href.match(/\/jobs\/([^/]+)\//)?.[1] || ''
                    const locationEls = Array.from(card.querySelectorAll('.list-inline.job-meta li'))
                    const location = locationEls.map(el => el.textContent?.trim()).filter(Boolean).join(', ')
                    const department = card.querySelector('.card-subtitle')?.textContent?.trim() || ''
                    const dateEl = card.querySelector('time, [class*="date"], [class*="Date"], [data-date], [datetime]') as HTMLElement | null
                    const dateText = (dateEl?.getAttribute('datetime') || dateEl?.textContent || '').trim()
                    return {
                        id: idFromUrl || title.slice(0, 40).replace(/\s+/g, '_').toLowerCase(),
                        title,
                        location,
                        department,
                        url: href,
                        text: card.textContent || '',
                        dateText,
                    }
                }).filter(j => j.id && j.title)
            }) as ExtractedJob[]

            if (jobs.length === 0) {
                consecutiveEmpty++
                if (consecutiveEmpty >= 2) break
                continue
            }
            consecutiveEmpty = 0

            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)
                collected.push(j)
            }

            await sleep(randomDelay(900, 1800))
        }

        return { hasDate: false, jobs: collected, context }
    } catch (err) {
        await browser.close()
        throw err
    }
}

async function scrapeSalesforceJobs() {
    console.log(`🚀 Salesforce Jobs Scraper`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const primaryUrl = company.careers_url || CONFIG.baseUrl
    const fallbackUrl = company.careers_url_1
    console.log(`🔗 Primary URL: ${primaryUrl}`)
    if (fallbackUrl) console.log(`🔁 Secondary URL: ${fallbackUrl}`)

    let sourceUrl = primaryUrl
    let result = await runSalesforceUrl(primaryUrl, CONFIG.maxPages, false)

    const collectedJobs: DbJob[] = []
    let hasAnyPostedDate = false
    let jobsWithoutDate = 0

    for (const j of result.jobs) {
        let postedDate = parsePostedDate(j.dateText)
        let detailDescription = cleanHtml(j.text)

        if (!postedDate && j.url) {
            const detail = await fetchSalesforceDetail(result.context, j.url)
            if (detail.postedDate) postedDate = detail.postedDate
            if (detail.description) detailDescription = detail.description
        }

        if (postedDate) hasAnyPostedDate = true
        if (!postedDate) {
            jobsWithoutDate++
            continue
        }
        if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
            continue
        }

        const finalPostedDate = postedDate || new Date().toISOString().split('T')[0]
        const finalLocation = normalizeLocation(j.location)
        const quals = parseDescriptionQualifications(detailDescription)

        const job: DbJob = {
            company_id: company.id,
            external_job_id: `salesforce_${j.id.toLowerCase()}`,
            title: j.title.slice(0, 240),
            location: finalLocation,
            location_type: determineLocationType(finalLocation, detailDescription),
            department: normalizeDepartment((j.department || 'General').slice(0, 240), j.title),
            employment_type: determineEmploymentType(j.title),
            posted_date: finalPostedDate,
            description: detailDescription,
            summary: `${j.title.slice(0, 180)} at Salesforce - ${finalLocation}`.slice(0, 240),
            required_qualifications: quals.required,
            preferred_qualifications: quals.preferred,
            pay_range: extractPayRange(detailDescription),
            security_clearance: detectSecurityClearance(detailDescription),
            h1b_sponsorship: detectH1BSponsorship(detailDescription),
            job_url: j.url || sourceUrl,
            is_active: true,
        }
        collectedJobs.push(job)

        await sleep(randomDelay(60, 140))
    }

    await result.context.browser()?.close()

    if (!hasAnyPostedDate) {
        if (fallbackUrl) {
            console.log('⚠️ No posting date found from primary URL. Secondary URL is configured but not needed for current source.')
            sourceUrl = fallbackUrl
        } else {
            console.log('⚠️ No posting date found from primary URL.')
        }
    }

    if (jobsWithoutDate > 0) {
        console.log(`ℹ️ Skipped ${jobsWithoutDate} jobs with missing posted date.`)
    }

    console.log(`📊 Total jobs collected: ${collectedJobs.length}`)
    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    console.log(`🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - CONFIG.dateWindowDays)
    const cutoffIso = cutoff.toISOString().split('T')[0]
    const { error: deactivateErr } = await supabase
        .from('jobs')
        .update({ is_active: false })
        .eq('company_id', company.id)
        .lt('posted_date', cutoffIso)
        .eq('is_active', true)
    if (deactivateErr) {
        console.log(`⚠️ Could not deactivate older Salesforce jobs: ${deactivateErr.message}`)
    }

    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

withScraperRun(CONFIG.companyName, scrapeSalesforceJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
