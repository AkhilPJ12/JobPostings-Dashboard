import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Meta Jobs Scraper
 *
 * Fallback policy:
 * 1) Scrape `careers_url` first
 * 2) If posted date is unavailable in job positions, try `careers_url_1`
 * 3) If still unavailable (or no careers_url_1), scrape first 20 pages and store
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Meta',
    dateWindowDays: 14,
    maxPages: 100,
    maxPagesNoDate: 20,
    assumedPageSize: 20,
}

type GraphQLMetaJob = {
    id?: string
    title?: string
    locations?: string[]
    teams?: string[]
    sub_teams?: string[]
}

type ExtractedJob = {
    id: string
    title: string
    location: string
    url: string
    text: string
    dateText: string
    department?: string
}

function clamp(s: string, max: number): string {
    if (!s) return ''
    return s.length > max ? s.slice(0, max) : s
}

function looksLikeDate(text: string): string | null {
    if (!text) return null
    const m = text.match(/(\b\w+\s+\d{1,2},\s*\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i)
    return m ? m[1] : null
}

async function runMetaViaGraphQL(baseUrl: string, pages: number, requireDate: boolean) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        let capturedResultsRequest = ''

        page.on('request', req => {
            if (capturedResultsRequest) return
            if (!req.url().includes('/graphql') || req.method() !== 'POST') return
            const body = req.postData() || ''
            const params = new URLSearchParams(body)
            if (params.get('fb_api_req_friendly_name') === 'CareersJobSearchResultsDataQuery') {
                capturedResultsRequest = body
            }
        })

        await navigateSource(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await sleep(5000)

        if (!capturedResultsRequest) {
            return { hasDate: false, jobs: [] as ExtractedJob[] }
        }

        const graphQLJobs = await page.evaluate(async (raw) => {
            const params = new URLSearchParams(raw)
            const res = await fetch('/graphql', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            })
            if (!res.ok) return [] as GraphQLMetaJob[]
            const json = await res.json() as {
                data?: {
                    job_search_with_featured_jobs?: {
                        all_jobs?: GraphQLMetaJob[]
                    }
                }
            }
            return json?.data?.job_search_with_featured_jobs?.all_jobs || []
        }, capturedResultsRequest) as GraphQLMetaJob[]

        const maxNoDateJobs = pages * CONFIG.assumedPageSize
        const limitedJobs = requireDate ? graphQLJobs : graphQLJobs.slice(0, maxNoDateJobs)

        const collected: ExtractedJob[] = []
        const seen = new Set<string>()

        for (const j of limitedJobs) {
            const id = String(j.id || '').trim()
            const title = String(j.title || '').trim()
            if (!id || !title || seen.has(id)) continue
            seen.add(id)

            const locations = Array.isArray(j.locations) ? j.locations.filter(Boolean) : []
            const location = locations[0] || 'United States'
            // Meta's GraphQL API does not return posting dates
            const dateText = ''

            const dept = [
                ...(Array.isArray(j.teams) ? j.teams : []),
                ...(Array.isArray(j.sub_teams) ? j.sub_teams : []),
            ].filter(Boolean).join(' / ')

            const text = [
                title,
                locations.join(' | '),
                dept,
            ].filter(Boolean).join('\n')

            collected.push({
                id,
                title,
                location,
                url: `https://www.metacareers.com/profile/job_details/${id}`,
                text,
                dateText,
                department: dept,
            })
        }

        // Meta GraphQL API does not provide posting dates
        return { hasDate: false, jobs: collected }
    } finally {
        await browser.close()
    }
}

async function scrapeMetaJobs() {
    console.log(`🚀 Meta Jobs Scraper`)
    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const primaryUrl = company.careers_url || 'https://www.metacareers.com/jobsearch?sort_by_new=true&offices[0]=North%20America'

    console.log(`🔗 URL: ${primaryUrl}`)

    // Meta's GraphQL API does not provide posting dates — collect all US jobs
    const sourceUrl = primaryUrl
    const result = await runMetaViaGraphQL(primaryUrl, CONFIG.maxPages, false)

    const collectedJobs: DbJob[] = []
    const seen = new Set<string>()
    for (const j of result.jobs) {
        if (seen.has(j.id)) continue
        seen.add(j.id)

        if (j.location && !isUSLocation(j.location) && !j.location.toLowerCase().includes('remote')) {
            continue
        }

        const postedDate = parsePostedDate(j.dateText || looksLikeDate(j.text))
        if (result.hasDate && (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays))) {
            continue
        }

        const finalPostedDate = postedDate || new Date().toISOString().split('T')[0]

        const description = cleanHtml(j.text)
        const safeTitle = clamp(j.title, 240)
        const safeLocation = clamp(j.location || 'United States', 240)
        const safeDepartment = clamp(j.department || 'General', 240)
        const safeSummary = clamp(`${safeTitle} at Meta - ${safeLocation}`, 240)
        const job: DbJob = {
            company_id: company.id,
            external_job_id: `meta_${j.id}`,
            title: safeTitle,
            location: safeLocation,
            location_type: determineLocationType(safeLocation, description),
            department: normalizeDepartment(safeDepartment, safeTitle),
            employment_type: determineEmploymentType(safeTitle),
            posted_date: finalPostedDate,
            description,
            summary: safeSummary,
            required_qualifications: [],
            preferred_qualifications: [],
            pay_range: extractPayRange(description),
            security_clearance: detectSecurityClearance(description),
            h1b_sponsorship: detectH1BSponsorship(description),
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
    const upsertedCount = await upsertJobsBatch(collectedJobs, 50, true)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

withScraperRun(CONFIG.companyName, scrapeMetaJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
