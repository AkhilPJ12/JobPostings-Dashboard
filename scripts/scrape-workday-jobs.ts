import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Generic Workday Jobs Scraper
 *
 * Scrapes job listings from any Workday-powered careers site using the CXS API.
 * Works for: CVS, AT&T, Walmart, and any other *.myworkdayjobs.com site.
 *
 * Usage:
 *   pnpm exec tsx scripts/scrape-workday-jobs.ts <companyName>
 *   e.g. pnpm exec tsx scripts/scrape-workday-jobs.ts "CVS"
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, extractPayRange, truncateField, parseRelativePostedDate,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay, withScraperRun, parseDescriptionQualifications,
    normalizeDepartment,
} from './scraper-utils'

const CONFIG = {
    pageSize: 20,
    maxPages: 120,
    dateWindowDays: 14,
}

/* ─── Workday types ────────────────────────────────────────────────────── */

type WorkdayPosting = {
    title?: string
    externalPath?: string
    locationsText?: string
    postedOn?: string
    bulletFields?: string[]
}

type WorkdayListResponse = {
    total?: number
    jobPostings?: WorkdayPosting[]
}

type WorkdayDetailsResponse = {
    jobPostingInfo?: {
        title?: string
        jobDescription?: string
        location?: string
        timeType?: string
        postedOn?: string
        startDate?: string
    }
}

/* ─── Date parser for Workday "Posted X days ago" format ───────────────── */

/* ─── Main scraper ─────────────────────────────────────────────────────── */

async function scrapeWorkdayJobs(companyName: string) {
    console.log(`🚀 Workday Scraper: ${companyName}`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA\n`)

    const company = await getCompany(companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const urls = [company.careers_url, company.careers_url_1].filter(Boolean) as string[]
    if (urls.length === 0) {
        throw new Error(`No careers URL for ${companyName}`)
    }

    const allJobs: DbJob[] = []
    const globalSeenIds = new Set<string>()

    for (const [urlIdx, careerUrl] of urls.entries()) {
        if (urlIdx > 0) console.log(`\n🔗 Scraping secondary URL (careers_url_1)...`)
        console.log(`🔗 Career URL: ${careerUrl}`)

        const jobs = await scrapeOneWorkdayUrl(company, careerUrl, globalSeenIds)
        allJobs.push(...jobs)
        console.log(`📊 Got ${jobs.length} jobs from URL ${urlIdx + 1}`)
    }

    console.log(`\n📊 Total jobs collected: ${allJobs.length}`)
    if (allJobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    const idPrefix = companyName.toLowerCase().replace(/[^a-z0-9]/g, '')

    // Set external_job_id prefix
    for (const job of allJobs) {
        if (!job.external_job_id.startsWith(`${idPrefix}_`)) {
            job.external_job_id = `${idPrefix}_${job.external_job_id}`
        }
    }

    console.log(`\n🗄️  Upserting ${allJobs.length} jobs into Supabase...`)
    const upsertedCount = await upsertJobsBatch(allJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(companyName, allJobs.length, upsertedCount, dbCount, urls[0])
}

async function scrapeOneWorkdayUrl(
    company: { id: number; name: string },
    careerUrl: string,
    globalSeenIds: Set<string>,
): Promise<DbJob[]> {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        await navigateSource(page, careerUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await sleep(2000)

        // Extract tenant/site info from the Workday page URL
        const sourceInfo = await page.evaluate(() => {
            const pathParts = window.location.pathname.split('/').filter(Boolean)
            const tenant = window.location.hostname.split('.')[0] || ''
            // Workday URLs: /{site} or /{lang}/{site} or /{lang}/{site}/jobs
            // If first part looks like a language code, second part is the site
            const isLang = /^[a-z]{2}(-[A-Z]{2})?$/.test(pathParts[0] || '')
            const lang = isLang ? pathParts[0] : 'en-US'
            const site = isLang ? (pathParts[1] || '') : (pathParts[0] || '')
            return {
                origin: window.location.origin,
                tenant,
                lang,
                site,
                fullUrl: window.location.href,
            }
        })

        // Parse applied facets from the URL query parameters
        const appliedFacets = parseWorkdayFacets(careerUrl)

        console.log(`   Tenant: ${sourceInfo.tenant}, Site: ${sourceInfo.site}`)
        console.log(`   Applied facets: ${Object.keys(appliedFacets).length}`)

        const collectedJobs: DbJob[] = []
        const idPrefix = company.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        let consecutiveEmpty = 0

        for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
            const offset = (pageNum - 1) * CONFIG.pageSize
            console.log(`📄 Page ${pageNum} (offset=${offset})...`)

            const list = await page.evaluate(async (args) => {
                const endpoint = `/wday/cxs/${args.tenant}/${args.site}/jobs`
                const body: Record<string, unknown> = {
                    limit: args.limit,
                    offset: args.offset,
                    searchText: '',
                    appliedFacets: args.appliedFacets,
                }
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!res.ok) return null
                return await res.json() as WorkdayListResponse
            }, {
                tenant: sourceInfo.tenant,
                site: sourceInfo.site,
                limit: CONFIG.pageSize,
                offset,
                appliedFacets,
            })

            if (!list?.jobPostings?.length) {
                console.log('📭 No more jobs found. Done.')
                break
            }

            let newJobs = 0
            let dateSkipped = 0

            for (const p of list.jobPostings) {
                const title = (p.title || '').trim()
                const externalPath = (p.externalPath || '').trim()
                const fallbackId = externalPath.split('_').pop()?.trim() || ''
                const id = (p.bulletFields?.[0] || fallbackId || '').trim()
                if (!id || !title || globalSeenIds.has(id)) continue
                globalSeenIds.add(id)

                const postedDate = parseRelativePostedDate(p.postedOn)
                if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                const location = (p.locationsText || 'United States').trim()
                if (location && !isUSLocation(location) && !location.toLowerCase().includes('remote')) {
                    continue
                }

                // Fetch detail page for full description
                const details = await page.evaluate(async (args) => {
                    if (!args.externalPath) return null
                    const endpoint = `/wday/cxs/${args.tenant}/${args.site}${args.externalPath}`
                    const res = await fetch(endpoint)
                    if (!res.ok) return null
                    return await res.json() as WorkdayDetailsResponse
                }, {
                    tenant: sourceInfo.tenant,
                    site: sourceInfo.site,
                    externalPath,
                })

                const detail = details?.jobPostingInfo
                const detailDescription = cleanHtml(detail?.jobDescription || '')
                const quals = parseDescriptionQualifications(detailDescription)
                const detailLocation = detail?.location?.trim() || location
                const detailPosted = parseRelativePostedDate(detail?.postedOn)
                    || parsePostedDate(detail?.startDate || null)
                    || postedDate

                if (!detailPosted || !isWithinDaysOrFuture(detailPosted, CONFIG.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                const textForSignals = [
                    title, detailLocation, detail?.timeType || '', detailDescription,
                ].filter(Boolean).join('\n')

                const publicPath = externalPath
                    ? `/${sourceInfo.lang}/${sourceInfo.site}${externalPath}`
                    : `/${sourceInfo.lang}/${sourceInfo.site}`
                const detailsUrl = `${sourceInfo.origin}${publicPath}`

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `${idPrefix}_${id}`,
                    title: truncateField(detail?.title?.trim() || title),
                    location: truncateField(detailLocation),
                    location_type: determineLocationType(detailLocation, detailDescription),
                    department: normalizeDepartment('General', detail?.title?.trim() || title),
                    employment_type: determineEmploymentType(`${detail?.timeType || ''} ${title}`),
                    posted_date: detailPosted,
                    description: textForSignals,
                    summary: truncateField(`${title} at ${company.name} - ${detailLocation}`),
                    required_qualifications: quals.required,
                    preferred_qualifications: quals.preferred,
                    pay_range: truncateField(extractPayRange(textForSignals)),
                    security_clearance: detectSecurityClearance(textForSignals),
                    h1b_sponsorship: detectH1BSponsorship(textForSignals),
                    sourceHints: { employmentType: detail?.timeType || '' },
                    job_url: truncateField(detailsUrl),
                    is_active: true,
                }

                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

            if (newJobs === 0) consecutiveEmpty++
            else consecutiveEmpty = 0

            if (consecutiveEmpty >= 3) {
                console.log('📭 Consecutive out-of-range pages reached. Stopping early.')
                break
            }

            if (list.jobPostings.length < CONFIG.pageSize) {
                console.log('📭 Last page reached. Done.')
                break
            }

            await sleep(randomDelay(500, 1200))
        }

        return collectedJobs
    } finally {
        await browser.close()
    }
}

/**
 * Parse Workday URL query parameters into appliedFacets object.
 * Workday URLs use repeated param names for multi-value facets.
 */
function parseWorkdayFacets(url: string): Record<string, string[]> {
    const facets: Record<string, string[]> = {}
    try {
        const parsed = new URL(url)
        const knownFacets = [
            'locationCountry', 'locationHierarchy1', 'locationHierarchy2',
            'jobFamilyGroup', 'jobFamily', 'timeType', 'workerSubType',
        ]
        for (const key of knownFacets) {
            const values = parsed.searchParams.getAll(key)
            if (values.length > 0) {
                facets[key] = values
            }
        }
    } catch { /* ignore parse errors */ }
    return facets
}

/* ─── Entry point ──────────────────────────────────────────────────────── */

const companyArg = process.argv[2]
if (!companyArg) {
    console.error('Usage: pnpm exec tsx scripts/scrape-workday-jobs.ts <companyName>')
    process.exit(1)
}

withScraperRun(companyArg, () => scrapeWorkdayJobs(companyArg)).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
