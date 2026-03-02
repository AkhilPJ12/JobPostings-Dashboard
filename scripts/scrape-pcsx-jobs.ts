/**
 * PCSX Platform Scraper
 *
 * Microsoft: API-based scraping via /api/pcsx/search
 * Nvidia: Workday CXS API (primary) with fallback to Eightfold /api/pcsx/search
 */
import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

interface PCSXConfig {
    companyName: string
    baseUrl: string
    jobUrlBase: string
    pageSize: number
    maxPages: number
    dateWindowDays: number
    buildUrl: (careerUrl: string, start: number) => string
}

const CONFIGS: Record<string, PCSXConfig> = {
    microsoft: {
        companyName: 'Microsoft',
        baseUrl: 'https://apply.careers.microsoft.com',
        jobUrlBase: 'https://apply.careers.microsoft.com/careers/job/',
        pageSize: 10,
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
        jobUrlBase: 'https://nvidia.eightfold.ai/careers/job/',
        pageSize: 20,
        maxPages: 120,
        dateWindowDays: 14,
        buildUrl: (careerUrl, start) => {
            const url = new URL(careerUrl)
            url.searchParams.set('start', String(start))
            return url.toString()
        },
    },
}

type NvidiaPosition = {
    id?: number
    atsJobId?: string
    displayJobId?: string
    name?: string
    locations?: string[]
    department?: string
    postedTs?: number
    creationTs?: number
    positionUrl?: string
}

type NvidiaWorkdayPosting = {
    title?: string
    externalPath?: string
    locationsText?: string
    postedOn?: string
    bulletFields?: string[]
}

type NvidiaWorkdayListResponse = {
    total?: number
    jobPostings?: NvidiaWorkdayPosting[]
}

type NvidiaWorkdayDetailsResponse = {
    jobPostingInfo?: {
        title?: string
        jobDescription?: string
        location?: string
        timeType?: string
        postedOn?: string
        startDate?: string
    }
}

type MicrosoftPosition = {
    id?: number
    atsJobId?: string
    displayJobId?: string
    name?: string
    locations?: string[]
    postedTs?: number
    creationTs?: number
    positionUrl?: string
    department?: string
}

type MicrosoftSearchResponse = {
    data?: {
        positions?: MicrosoftPosition[]
    }
}

function withOrigin(origin: string, maybeRelative?: string): string {
    if (!maybeRelative) return origin
    if (maybeRelative.startsWith('http://') || maybeRelative.startsWith('https://')) return maybeRelative
    return `${origin}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`
}

function parseNvidiaPostedOn(text: string | null | undefined): string | null {
    if (!text) return null
    const raw = text.trim()
    if (!raw) return null
    if (/posted\s+today/i.test(raw)) return new Date().toISOString().split('T')[0]
    if (/posted\s+yesterday/i.test(raw)) {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return d.toISOString().split('T')[0]
    }
    const daysAgo = raw.match(/posted\s+(\d+)\s+days?\s+ago/i)
    if (daysAgo) {
        const d = new Date()
        d.setDate(d.getDate() - Number(daysAgo[1]))
        return d.toISOString().split('T')[0]
    }
    const cleaned = raw.replace(/^posted\s+on\s+/i, '').replace(/^posted\s+/i, '').trim()
    return parsePostedDate(cleaned)
}

function buildMicrosoftSearchEndpoint(careerUrl: string, start: number): string {
    const careers = new URL(careerUrl)
    const endpoint = new URL('/api/pcsx/search', careers.origin)
    const params = endpoint.searchParams
    params.set('domain', 'microsoft.com')
    params.set('query', '')
    params.set('location', careers.searchParams.get('location') || 'United States, Multiple Locations, Multiple Locations')
    params.set('start', String(start))
    params.set('sort_by', careers.searchParams.get('sort_by') || 'timestamp')
    params.set('filter_include_remote', careers.searchParams.get('filter_include_remote') || '0')
    return endpoint.toString()
}

async function runNvidiaApiPages(
    config: PCSXConfig,
    company: { id: number; name: string },
    careerUrl: string,
    maxPages: number,
    requireDate: boolean,
) {
    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()
    let hasAnyPostedDate = false

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const start = (pageNum - 1) * config.pageSize
        console.log(`📄 Page ${pageNum} (start=${start})...`)

        const endpoint = `https://nvidia.eightfold.ai/api/pcsx/search?domain=nvidia.com&query=&location=United%20States&start=${start}&sort_by=distance&filter_include_remote=1`
        const resp = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': careerUrl,
            },
        })

        if (!resp.ok) {
            console.log(`   ⚠️ API error ${resp.status}. Stopping.`)
            break
        }

        const data = await resp.json() as { data?: { positions?: NvidiaPosition[] } }
        const positions = data.data?.positions || []

        if (positions.length === 0) {
            console.log('📭 No more jobs found. Done.')
            break
        }

        let newJobs = 0
        let dateSkipped = 0

        for (const p of positions) {
            const id = String(p.id || p.atsJobId || p.displayJobId || '')
            const title = (p.name || '').trim()
            if (!id || !title || seenIds.has(id)) continue
            seenIds.add(id)

            const postedDate = parsePostedDate(p.postedTs || p.creationTs || null)
            if (postedDate) hasAnyPostedDate = true
            if (!postedDate) {
                dateSkipped++
                continue
            }
            if (!isWithinDaysOrFuture(postedDate, config.dateWindowDays)) {
                dateSkipped++
                continue
            }

            const location = p.locations?.[0] || 'United States'
            if (location && !isUSLocation(location) && !location.toLowerCase().includes('remote')) {
                continue
            }

            const detailsUrl = p.positionUrl?.startsWith('/')
                ? `https://nvidia.eightfold.ai${p.positionUrl}`
                : (p.positionUrl || `${config.jobUrlBase}${id}`)

            const textForSignals = `${title}\n${location}\n${p.department || ''}`

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `nvidia_${id}`,
                title,
                location,
                location_type: determineLocationType(location),
                department: p.department || 'General',
                employment_type: determineEmploymentType(title),
                posted_date: postedDate,
                description: textForSignals,
                summary: `${title} at ${config.companyName} - ${location}`,
                required_qualifications: [],
                preferred_qualifications: [],
                pay_range: 'Not specified',
                security_clearance: detectSecurityClearance(textForSignals),
                h1b_sponsorship: detectH1BSponsorship(textForSignals),
                job_url: detailsUrl,
                is_active: true,
            }

            collectedJobs.push(job)
            newJobs++
        }

        console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

        if (positions.length < config.pageSize) {
            console.log('📭 Last page reached. Done.')
            break
        }

        await sleep(randomDelay(1000, 2200))
    }

    if (requireDate && !hasAnyPostedDate) {
        return { hasDate: false, jobs: [] as DbJob[] }
    }

    return { hasDate: hasAnyPostedDate, jobs: collectedJobs }
}

async function runNvidiaWorkdayPages(
    config: PCSXConfig,
    company: { id: number; name: string },
    careerUrl: string,
    maxPages: number,
    requireDate: boolean,
) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        await page.goto(careerUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await sleep(1800)

        const sourceInfo = await page.evaluate(() => {
            const pathParts = window.location.pathname.split('/').filter(Boolean)
            const lang = pathParts[0] || 'en-US'
            const site = pathParts[1] || 'NVIDIAExternalCareerSite'
            const tenant = window.location.hostname.split('.')[0] || 'nvidia'
            const locKey = new URL(window.location.href).searchParams.get('locationHierarchy1')
            return {
                origin: window.location.origin,
                tenant,
                lang,
                site,
                locationHierarchy1: locKey,
            }
        })

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()
        let hasAnyPostedDate = false

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const offset = (pageNum - 1) * config.pageSize
            console.log(`📄 Page ${pageNum} (offset=${offset})...`)

            const list = await page.evaluate(async (args) => {
                const endpoint = `/wday/cxs/${args.tenant}/${args.site}/jobs`
                const body: Record<string, unknown> = {
                    limit: args.limit,
                    offset: args.offset,
                    searchText: '',
                }
                if (args.locationHierarchy1) {
                    body.appliedFacets = { locationHierarchy1: [args.locationHierarchy1] }
                }
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (!res.ok) return null
                return await res.json() as NvidiaWorkdayListResponse
            }, {
                tenant: sourceInfo.tenant,
                site: sourceInfo.site,
                limit: config.pageSize,
                offset,
                locationHierarchy1: sourceInfo.locationHierarchy1,
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
                if (!id || !title || seenIds.has(id)) continue
                seenIds.add(id)

                const postedDate = parseNvidiaPostedOn(p.postedOn)
                if (postedDate) hasAnyPostedDate = true
                if (requireDate && (!postedDate || !isWithinDaysOrFuture(postedDate, config.dateWindowDays))) {
                    dateSkipped++
                    continue
                }

                const location = (p.locationsText || 'United States').trim()
                if (location && !isUSLocation(location) && !location.toLowerCase().includes('remote')) {
                    continue
                }

                const details = await page.evaluate(async (args) => {
                    if (!args.externalPath) return null
                    const endpoint = `/wday/cxs/${args.tenant}/${args.site}${args.externalPath}`
                    const res = await fetch(endpoint)
                    if (!res.ok) return null
                    return await res.json() as NvidiaWorkdayDetailsResponse
                }, {
                    tenant: sourceInfo.tenant,
                    site: sourceInfo.site,
                    externalPath,
                })

                const detail = details?.jobPostingInfo
                const detailDescription = cleanHtml(detail?.jobDescription || '')
                const detailLocation = detail?.location?.trim() || location
                const detailPosted = parseNvidiaPostedOn(detail?.postedOn) || parsePostedDate(detail?.startDate || null) || postedDate
                if (detailPosted) hasAnyPostedDate = true
                if (requireDate && (!detailPosted || !isWithinDaysOrFuture(detailPosted, config.dateWindowDays))) {
                    dateSkipped++
                    continue
                }

                const textForSignals = [
                    title,
                    detailLocation,
                    detail?.timeType || '',
                    detailDescription,
                ].filter(Boolean).join('\n')

                const publicPath = externalPath
                    ? `/${sourceInfo.lang}/${sourceInfo.site}${externalPath}`
                    : `/${sourceInfo.lang}/${sourceInfo.site}`
                const detailsUrl = `${sourceInfo.origin}${publicPath}`

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `nvidia_${id}`,
                    title: detail?.title?.trim() || title,
                    location: detailLocation,
                    location_type: determineLocationType(detailLocation, detailDescription),
                    department: 'General',
                    employment_type: determineEmploymentType(`${detail?.timeType || ''} ${title}`),
                    posted_date: detailPosted || new Date().toISOString().split('T')[0],
                    description: textForSignals,
                    summary: `${title} at ${config.companyName} - ${detailLocation}`,
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(textForSignals),
                    security_clearance: detectSecurityClearance(textForSignals),
                    h1b_sponsorship: detectH1BSponsorship(textForSignals),
                    job_url: detailsUrl,
                    is_active: true,
                }

                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

            if (list.jobPostings.length < config.pageSize) {
                console.log('📭 Last page reached. Done.')
                break
            }

            await sleep(randomDelay(800, 1600))
        }

        if (requireDate && !hasAnyPostedDate) {
            return { hasDate: false, jobs: [] as DbJob[] }
        }
        return { hasDate: hasAnyPostedDate, jobs: collectedJobs }
    } finally {
        await browser.close()
    }
}

async function runMicrosoftApiPages(
    config: PCSXConfig,
    company: { id: number; name: string },
    careerUrl: string,
    maxPages: number,
    requireDate: boolean,
) {
    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()
    let hasAnyPostedDate = false
    const origin = new URL(careerUrl).origin
    let staleDatePages = 0

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const start = (pageNum - 1) * config.pageSize
        console.log(`📄 Page ${pageNum} (start=${start})...`)

        const endpoint = buildMicrosoftSearchEndpoint(careerUrl, start)
        const resp = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': careerUrl,
            },
        })

        if (!resp.ok) {
            console.log(`   ⚠️ API error ${resp.status}. Stopping.`)
            break
        }

        const data = await resp.json() as MicrosoftSearchResponse
        const positions = data.data?.positions || []
        if (positions.length === 0) {
            console.log('📭 No more jobs found. Done.')
            break
        }

        let newJobs = 0
        let dateSkipped = 0

        for (const p of positions) {
            const id = String(p.displayJobId || p.atsJobId || p.id || '')
            const title = (p.name || '').trim()
            if (!id || !title || seenIds.has(id)) continue
            seenIds.add(id)

            const postedDate = parsePostedDate(p.postedTs || p.creationTs || null)
            if (postedDate) hasAnyPostedDate = true

            if (requireDate && (!postedDate || !isWithinDaysOrFuture(postedDate, config.dateWindowDays))) {
                dateSkipped++
                continue
            }

            const location = p.locations?.[0] || 'United States'
            if (location && !isUSLocation(location) && !location.toLowerCase().includes('remote') && !location.includes('Multiple')) {
                continue
            }

            const externalJobId = String(p.displayJobId || p.atsJobId || p.id)
            const finalTitle = title
            const combinedText = cleanHtml([
                `Job number: ${externalJobId}`,
                postedDate ? `Date posted: ${postedDate}` : '',
                `Location: ${location}`,
                p.department ? `Department: ${p.department}` : '',
            ].filter(Boolean).join('\n'))
            const detailsUrl = withOrigin(origin, p.positionUrl || `${config.jobUrlBase}${externalJobId}`)

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `microsoft_${externalJobId}`,
                title: finalTitle,
                location,
                location_type: determineLocationType(location, combinedText),
                department: p.department || 'General',
                employment_type: determineEmploymentType(finalTitle),
                posted_date: postedDate || new Date().toISOString().split('T')[0],
                description: combinedText,
                summary: `${finalTitle} at ${config.companyName} - ${location}`,
                required_qualifications: [],
                preferred_qualifications: [],
                pay_range: extractPayRange(combinedText),
                security_clearance: detectSecurityClearance(combinedText),
                h1b_sponsorship: detectH1BSponsorship(combinedText),
                job_url: detailsUrl,
                is_active: true,
            }

            collectedJobs.push(job)
            newJobs++
        }

        console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

        if (requireDate && newJobs === 0 && dateSkipped === positions.length) {
            staleDatePages++
            if (staleDatePages >= 3) {
                console.log('📭 Consecutive out-of-range pages reached. Stopping early.')
                break
            }
        } else {
            staleDatePages = 0
        }

        if (positions.length < config.pageSize) {
            console.log('📭 Last page reached. Done.')
            break
        }

        await sleep(randomDelay(900, 1800))
    }

    if (requireDate && !hasAnyPostedDate) {
        return { hasDate: false, jobs: [] as DbJob[] }
    }
    return { hasDate: hasAnyPostedDate, jobs: collectedJobs }
}

async function scrapeNvidiaViaApi(
    config: PCSXConfig,
    company: { id: number; name: string; careers_url: string | null; careers_url_1: string | null },
    careerUrl: string,
) {
    console.log(`🌐 Using Nvidia scraper`)

    let sourceUrl = careerUrl
    let result = careerUrl.includes('myworkdayjobs.com')
        ? await runNvidiaWorkdayPages(config, company, careerUrl, config.maxPages, true)
        : await runNvidiaApiPages(config, company, careerUrl, config.maxPages, true)

    if (!result.hasDate) {
        console.log('⚠️ No posting date in primary jobs.')
        if (company.careers_url_1) {
            sourceUrl = company.careers_url_1
            const second = sourceUrl.includes('myworkdayjobs.com')
                ? await runNvidiaWorkdayPages(config, company, sourceUrl, config.maxPages, true)
                : await runNvidiaApiPages(config, company, sourceUrl, config.maxPages, true)
            if (second.hasDate) {
                console.log('✅ Using secondary URL with posting dates.')
                result = second
            } else {
                console.log('⚠️ Secondary URL also has no posting dates. Using first 20 pages.')
                result = sourceUrl.includes('myworkdayjobs.com')
                    ? await runNvidiaWorkdayPages(config, company, sourceUrl, 20, false)
                    : await runNvidiaApiPages(config, company, sourceUrl, 20, false)
            }
        } else {
            console.log('⚠️ No secondary URL. Using first 20 pages from primary URL.')
            result = careerUrl.includes('myworkdayjobs.com')
                ? await runNvidiaWorkdayPages(config, company, careerUrl, 20, false)
                : await runNvidiaApiPages(config, company, careerUrl, 20, false)
        }
    }

    const collectedJobs = result.jobs
    console.log(`\n📊 Total jobs collected: ${collectedJobs.length}`)

    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found with valid posting dates.')
        return
    }

    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(config.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

async function scrapeMicrosoftViaApi(
    config: PCSXConfig,
    company: { id: number; name: string; careers_url: string | null; careers_url_1: string | null },
    careerUrl: string,
) {
    console.log(`🌐 Using Microsoft API mode`)

    let sourceUrl = careerUrl
    let result = await runMicrosoftApiPages(config, company, careerUrl, config.maxPages, true)

    if (!result.hasDate) {
        console.log('⚠️ No posting date in primary jobs.')
        if (company.careers_url_1) {
            sourceUrl = company.careers_url_1
            const second = await runMicrosoftApiPages(config, company, sourceUrl, config.maxPages, true)
            if (second.hasDate) {
                console.log('✅ Using secondary URL with posting dates.')
                result = second
            } else {
                console.log('⚠️ Secondary URL also has no posting dates. Using first 20 pages.')
                result = await runMicrosoftApiPages(config, company, sourceUrl, 20, false)
            }
        } else {
            console.log('⚠️ No secondary URL. Using first 20 pages from primary URL.')
            result = await runMicrosoftApiPages(config, company, careerUrl, 20, false)
        }
    }

    const collectedJobs = result.jobs
    console.log(`\n📊 Total jobs collected: ${collectedJobs.length}`)
    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found with valid posting dates.')
        return
    }

    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(config.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

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

    if (companyKey === 'nvidia') {
        await scrapeNvidiaViaApi(config, company, careerUrl)
        return
    }

    await scrapeMicrosoftViaApi(config, company, careerUrl)
}

const companyArg = process.argv[2]?.toLowerCase()
if (!companyArg) {
    console.error('Usage: npx tsx scripts/scrape-pcsx-jobs.ts <microsoft|nvidia>')
    process.exit(1)
}

scrapePCSXJobs(companyArg).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
