import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * PCSX Platform Scraper
 *
 * Microsoft: API-based scraping via /api/pcsx/search + /api/apply/v2/jobs for details
 * Nvidia: Workday CXS API (primary) with fallback to Eightfold /api/pcsx/search
 */
import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isUSLocation, isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, extractPayRange, parseQualifications,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay, withScraperRun, parseDescriptionQualifications,
    normalizeDepartment,
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

type MicrosoftDetailResponse = {
    id?: number
    name?: string
    job_description?: string
    ats_job_id?: string
    display_job_id?: string
    department?: string
    location?: string
    locations?: string[]
    work_location_option?: string
}

type MicrosoftParsedSections = {
    overview: string
    responsibilities: string
    requiredQualifications: string[]
    preferredQualifications: string[]
    otherInfo: string
    fullText: string
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

// ─── Microsoft Detail Fetching ──────────────────────────────────────────────

/**
 * Fetch full job details from Microsoft's detail API.
 * Uses the internal position ID (the large numeric id from search results).
 */
async function fetchMicrosoftJobDetail(internalId: number | string): Promise<MicrosoftDetailResponse | null> {
    try {
        const url = `https://apply.careers.microsoft.com/api/apply/v2/jobs/${internalId}?domain=microsoft.com`
        const resp = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
        })
        if (!resp.ok) return null
        return await resp.json() as MicrosoftDetailResponse
    } catch {
        return null
    }
}

/**
 * Convert HTML to clean text, only adding newlines for block-level elements.
 * Unlike cleanHtml(), this preserves inline elements (<span>, <strong>, <a>, etc.)
 * so words aren't broken apart.
 */
function msHtmlToText(html: string): string {
    if (!html) return ''
    return html
        // Block-level breaks
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|h[1-6])>/gi, '\n')
        .replace(/<(?:p|div|h[1-6])[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<\/?(ul|ol)[^>]*>/gi, '')
        // Strip all remaining tags (inline: span, strong, a, em, b, etc.)
        .replace(/<[^>]+>/g, '')
        // Decode entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Collapse whitespace
        .replace(/[ \t]+/g, ' ')
        .replace(/\n /g, '\n')
        .replace(/ \n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * Extract <li> items from HTML, returning clean text for each.
 * Handles nested lists by flattening.
 */
function extractHtmlListItems(html: string): string[] {
    const items: string[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let m: RegExpExecArray | null
    while ((m = liRegex.exec(html)) !== null) {
        const text = m[1]
            // Strip nested <ul>/<ol> (handled by outer loop)
            .replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '')
            .replace(/<ol[^>]*>[\s\S]*?<\/ol>/gi, '')
            // Strip all remaining tags
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
        if (text.length > 5) items.push(text)
    }
    return items
}

/**
 * Parse Microsoft's HTML job_description into structured sections.
 * Works directly on HTML to preserve inline formatting and extract list items properly.
 */
function parseMicrosoftDescription(html: string): MicrosoftParsedSections {
    // Split by major section headers: <b>Overview</b>, <b>Responsibilities</b>, <b>Qualifications</b>
    const sectionRegex = /<b>\s*(Overview|Responsibilities|Qualifications)\s*<\/b>/gi
    const markers: { name: string; index: number; end: number }[] = []
    let m: RegExpExecArray | null
    while ((m = sectionRegex.exec(html)) !== null) {
        markers.push({ name: m[1].toLowerCase(), index: m.index, end: m.index + m[0].length })
    }

    const htmlSections: Record<string, string> = {}
    for (let i = 0; i < markers.length; i++) {
        const start = markers[i].end
        const end = markers[i + 1]?.index ?? html.length
        htmlSections[markers[i].name] = html.slice(start, end)
    }

    // Overview → clean text
    const overview = msHtmlToText(htmlSections['overview'] || '')

    // Responsibilities → extract list items
    const respHtml = htmlSections['responsibilities'] || ''
    const respItems = extractHtmlListItems(respHtml)
    const responsibilities = respItems.length > 0
        ? respItems.map(item => `• ${item}`).join('\n')
        : msHtmlToText(respHtml)

    // Qualifications → split by <strong> sub-headers in HTML
    const qualsHtml = htmlSections['qualifications'] || ''

    // Required qualifications
    const reqMatch = qualsHtml.match(
        /Required\s+Qualifications?\s*:?\s*<\/(?:strong|b|p)>([\s\S]*?)(?=<(?:p|strong)[^>]*>\s*(?:<strong>)?\s*(?:Other\s+Requirements?|Preferred)|<hr|<p>\s*#|$)/i
    )
    // Other requirements (append to required)
    const otherReqMatch = qualsHtml.match(
        /Other\s+Requirements?\s*:?\s*<\/(?:strong|b|p)>([\s\S]*?)(?=<(?:p|strong)[^>]*>\s*(?:<strong>)?\s*Preferred|<hr|<p>\s*#|$)/i
    )
    // Preferred qualifications
    const prefMatch = qualsHtml.match(
        /Preferred\s+[Qq]ualifications?\s*:?\s*<\/(?:strong|b|p)>([\s\S]*?)(?=<p>\s*#|<hr|<br\s*\/?>\s*<br\s*\/?>\s*<p>\s*(?:Software\s+Engineering|The\s+typical)|$)/i
    )

    const requiredQualifications = extractHtmlListItems(reqMatch?.[1] || '')
    const preferredQualifications = extractHtmlListItems(prefMatch?.[1] || '')

    // Add "Other Requirements" as a single item to required
    if (otherReqMatch) {
        const otherText = msHtmlToText(otherReqMatch[1])
        if (otherText.length > 10) {
            requiredQualifications.push(otherText)
        }
    }

    // Other info — pay range, position info at the bottom of the full HTML
    // Pattern: "Role Level IC/M# - The typical base pay..." or "The typical base pay..."
    const payMatch = html.match(
        /<p>\s*(?:[A-Z][A-Za-z\s&/]+IC\d+|[A-Z][A-Za-z\s&/]+M\d+|The\s+typical\s+base|Microsoft\s+will\s+accept|Software\s+Engineering)\s*[\-–—]?\s*The\s+typical[\s\S]*?(?=<br\s*\/?>\s*<hr|<hr|$)/i
    ) || html.match(
        /<p>\s*(?:The\s+typical\s+base|Microsoft\s+will\s+accept)([\s\S]*?)(?=<br\s*\/?>\s*<hr|<hr|$)/i
    )
    let otherInfo = payMatch ? msHtmlToText(payMatch[0]) : ''
    // Remove hashtags
    otherInfo = otherInfo.replace(/#\w+\s*/g, '').trim()
    otherInfo = otherInfo.replace(/\n{3,}/g, '\n\n').trim()

    // Full text for signal detection
    const fullText = msHtmlToText(html)

    return {
        overview,
        responsibilities,
        requiredQualifications,
        preferredQualifications,
        otherInfo,
        fullText,
    }
}

// ─── Nvidia Scrapers ────────────────────────────────────────────────────────

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

            const location = p.locations?.[0] || ''
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
                department: normalizeDepartment(p.department || 'General', title),
                employment_type: determineEmploymentType(title),
                posted_date: postedDate,
                description: textForSignals,
                summary: `${title} at ${config.companyName} - ${location}`,
                required_qualifications: [],
                preferred_qualifications: [],
                pay_range: 'Not specified',
                security_clearance: detectSecurityClearance(textForSignals),
                h1b_sponsorship: detectH1BSponsorship(textForSignals),
                structuredSourceFields: { department: p.department || null },
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
        await navigateSource(page, careerUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
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
                if (!postedDate || !isWithinDaysOrFuture(postedDate, config.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                const location = (p.locationsText || '').trim()
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
                const quals = parseDescriptionQualifications(detailDescription)
                const detailLocation = detail?.location?.trim() || location
                const detailPosted = parseNvidiaPostedOn(detail?.postedOn) || parsePostedDate(detail?.startDate || null) || postedDate
                if (detailPosted) hasAnyPostedDate = true
                if (!detailPosted || !isWithinDaysOrFuture(detailPosted, config.dateWindowDays)) {
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
                    department: normalizeDepartment('General', detail?.title?.trim() || title),
                    employment_type: determineEmploymentType(`${detail?.timeType || ''} ${title}`),
                    posted_date: detailPosted as string,
                    description: textForSignals,
                    summary: `${title} at ${config.companyName} - ${detailLocation}`,
                    required_qualifications: quals.required,
                    preferred_qualifications: quals.preferred,
                    pay_range: extractPayRange(textForSignals),
                    security_clearance: detectSecurityClearance(textForSignals),
                    h1b_sponsorship: detectH1BSponsorship(textForSignals),
                    sourceHints: { employmentType: detail?.timeType || '' },
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

// ─── Microsoft Scraper ──────────────────────────────────────────────────────

/**
 * Collect Microsoft jobs from search API, then enrich each with full detail content
 * from the /api/apply/v2/jobs/{id} detail API.
 */
async function runMicrosoftApiPages(
    config: PCSXConfig,
    company: { id: number; name: string },
    careerUrl: string,
    maxPages: number,
    requireDate: boolean,
) {
    // Track internal IDs for detail fetching
    const jobInternalIds = new Map<string, number>()
    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()
    let hasAnyPostedDate = false
    const origin = new URL(careerUrl).origin
    let staleDatePages = 0

    // Phase 1: Collect jobs from search API
    console.log('📋 Phase 1: Collecting jobs from search API...')
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
            const displayId = String(p.displayJobId || p.atsJobId || p.id || '')
            const title = (p.name || '').trim()
            if (!displayId || !title || seenIds.has(displayId)) continue
            seenIds.add(displayId)

            const postedDate = parsePostedDate(p.postedTs || p.creationTs || null)
            if (postedDate) hasAnyPostedDate = true

            if (requireDate && (!postedDate || !isWithinDaysOrFuture(postedDate, config.dateWindowDays))) {
                dateSkipped++
                continue
            }

            const location = p.locations?.[0] || ''
            if (location && !isUSLocation(location) && !location.toLowerCase().includes('remote') && !location.includes('Multiple')) {
                continue
            }

            const externalJobId = displayId
            const detailsUrl = withOrigin(origin, p.positionUrl || `${config.jobUrlBase}${externalJobId}`)

            // Store internal ID for detail fetching (the large numeric id)
            if (p.id) {
                jobInternalIds.set(externalJobId, p.id)
            }

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `microsoft_${externalJobId}`,
                title,
                location,
                location_type: determineLocationType(location),
                department: normalizeDepartment(p.department || 'General', title),
                employment_type: determineEmploymentType(title),
                posted_date: postedDate as string,
                description: '',
                summary: `${title} at ${config.companyName} - ${location}`,
                required_qualifications: [],
                preferred_qualifications: [],
                pay_range: 'Not specified',
                security_clearance: 'N/A',
                h1b_sponsorship: 'N/A',
                structuredSourceFields: { department: p.department || null },
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

    // Phase 2: Enrich each job with full detail content
    console.log(`\n📝 Phase 2: Enriching ${collectedJobs.length} jobs with detail content...`)
    let enriched = 0
    let failed = 0

    for (let i = 0; i < collectedJobs.length; i++) {
        const job = collectedJobs[i]
        const displayId = job.external_job_id.replace('microsoft_', '')
        const internalId = jobInternalIds.get(displayId)

        if (!internalId) {
            failed++
            continue
        }

        try {
            const detail = await fetchMicrosoftJobDetail(internalId)
            if (detail?.job_description) {
                const parsed = parseMicrosoftDescription(detail.job_description)

                // Summary = Overview content
                if (parsed.overview) {
                    job.summary = parsed.overview
                }

                // Description = Responsibilities text.
                // Append other info with a separator so the frontend can split it.
                const descParts: string[] = []
                if (parsed.responsibilities) {
                    descParts.push(parsed.responsibilities)
                }
                if (parsed.otherInfo) {
                    descParts.push('\n---OTHER_INFO---\n' + parsed.otherInfo)
                }
                job.description = descParts.join('\n\n') || parsed.fullText

                // Qualifications
                if (parsed.requiredQualifications.length > 0) {
                    job.required_qualifications = parsed.requiredQualifications
                }
                if (parsed.preferredQualifications.length > 0) {
                    job.preferred_qualifications = parsed.preferredQualifications
                }

                // Re-detect signals from full text (now we have the real content)
                job.security_clearance = detectSecurityClearance(parsed.fullText)
                job.h1b_sponsorship = detectH1BSponsorship(parsed.fullText)
                job.pay_range = extractPayRange(parsed.fullText)

                // Update location type from full text
                job.location_type = determineLocationType(job.location, parsed.fullText)

                enriched++
            } else {
                failed++
            }
        } catch {
            failed++
        }

        // Log progress every 25 jobs
        if ((i + 1) % 25 === 0 || i === collectedJobs.length - 1) {
            console.log(`   📝 Progress: ${i + 1}/${collectedJobs.length} (${enriched} enriched, ${failed} failed)`)
        }

        // Rate limit detail API calls
        await sleep(randomDelay(200, 500))
    }

    console.log(`   ✅ Enrichment complete: ${enriched} enriched, ${failed} failed out of ${collectedJobs.length}`)

    return { hasDate: hasAnyPostedDate, jobs: collectedJobs }
}

// ─── Main Scrape Functions ──────────────────────────────────────────────────

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
                console.log('⚠️ Secondary URL also has no posting dates. Skipping Nvidia jobs.')
            }
        } else {
            console.log('⚠️ No secondary URL and no posting dates found. Skipping Nvidia jobs.')
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
    console.log(`🌐 Using Microsoft API mode (with detail enrichment)`)

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
                console.log('⚠️ Secondary URL also has no posting dates. Skipping Microsoft jobs.')
            }
        } else {
            console.log('⚠️ No secondary URL and no posting dates found. Skipping Microsoft jobs.')
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
    console.error('Usage: pnpm exec tsx scripts/scrape-pcsx-jobs.ts <microsoft|nvidia>')
    process.exit(1)
}

const companyName = companyArg === 'nvidia' ? 'Nvidia' : 'Microsoft'
withScraperRun(companyName, () => scrapePCSXJobs(companyArg)).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
