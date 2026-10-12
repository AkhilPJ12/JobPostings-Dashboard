import { fetchSource } from '../lib/modules/ingestion/http'
/**
 * Amazon Jobs Scraper
 * 
 * Fetches job listings from Amazon's career URLs stored in the database.
 * Reads careers_url_1 through careers_url_4 from the companies table.
 * 
 * Filters applied in-code (since API doesn't reliably filter):
 * - Country: USA / United States / United States of America
 * - Date Range: Last 14 days
 * 
 * Stores results directly in Supabase database with external_job_id for deduplication.
 * 
 * Usage: pnpm exec tsx scripts/scrape-amazon-jobs.ts
 */

import { withScraperRun, normalizeDepartment, supabase, upsertJobsBatch, determineEmploymentType } from './scraper-utils'

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
    resultLimit: 100, // Override per-page limit for efficiency (API supports up to 100)
    maxPages: 300, // Safety limit (300 × 100 = 30K jobs max)
    dateWindowDays: 14,
    delayMinMs: 2000,
    delayMaxMs: 5000,
    companyName: 'Amazon',
    batchSize: 50, // Number of jobs to insert per batch
}

// Accepted country values — different career sites use different formats
const USA_COUNTRY_CODES = new Set([
    'USA',
    'US',
    'United States',
    'United States of America',
])

// ─── Security Clearance Detection ────────────────────────────────────────────

const SECURITY_CLEARANCE_PATTERNS = [
    /\b(?:active|current|existing|valid|possess)\s+(?:TS(?:\/SCI)?|top\s*secret|secret|SCI)\s*(?:clearance|polygraph)?/i,
    /\b(?:TS|TS\/SCI)\s*(?:with\s+)?(?:poly(?:graph)?|CI\s+poly(?:graph)?|full\s+scope\s+poly(?:graph)?)\b/i,
    /\bsecurity\s+clearance\s+(?:is\s+)?required\b/i,
    /\brequired[:\s]+.*?(?:security\s+clearance|TS\/SCI|top\s*secret|clearance)\b/i,
    /\bmust\s+(?:have|hold|possess|maintain|obtain)\s+(?:a\s+)?(?:active\s+)?(?:security\s+clearance|TS\/SCI|top\s*secret|secret\s+clearance|SCI)\b/i,
    /\b(?:DoD|DOD|Department\s+of\s+Defense)\s+(?:security\s+)?clearance\b/i,
    /\bclearance\s+(?:level|requirement|required)[:\s]+(?:TS\/SCI|top\s*secret|secret|confidential)\b/i,
    /\b(?:SSBI|Single\s+Scope\s+Background\s+Investigation)\b/i,
    /\b(?:active|current)\s+(?:U\.?S\.?\s+)?(?:government\s+)?clearance\b/i,
    /\beligib(?:le|ility)\s+(?:for|to\s+obtain)\s+(?:a\s+)?(?:security\s+)?clearance\b/i,
    /\bPublic\s+Trust\b/i,
    /\bSensitive\s+Compartmented\s+Information\b/i,
]

function detectSecurityClearance(text: string): 'Yes' | 'No' | 'N/A' {
    if (!text) return 'N/A'
    if (/(?:no|not|without).{0,25}(?:security )?clearance/i.test(text)) return 'No'
    for (const pattern of SECURITY_CLEARANCE_PATTERNS) {
        if (pattern.test(text)) return 'Yes'
    }
    return 'N/A'
}

// ─── H1B Sponsorship Detection ───────────────────────────────────────────────

const H1B_NO_SPONSOR_PATTERNS = [
    /\b(?:not|unable\s+to|cannot|will\s+not|does\s+not|won'?t)\s+(?:provide\s+)?(?:immigration\s+)?sponsor(?:ship)?\b/i,
    /\bno\s+(?:immigration\s+)?sponsor(?:ship)?\b/i,
    /\bU\.?S\.?\s+citizen(?:ship)?\s+(?:is\s+)?required\b/i,
    /\bmust\s+be\s+(?:a\s+)?(?:U\.?S\.?\s+)?citizen\b/i,
    /\bauthorized\s+to\s+work\s+(?:in\s+the\s+)?(?:U\.?S\.?|United\s+States)\s+(?:without\s+(?:future\s+)?sponsor(?:ship)?)\b/i,
    /\brequire(?:s|d)?\s+(?:current\s+)?(?:U\.?S\.?\s+)?work\s+authorization\b/i,
]

const H1B_WILL_SPONSOR_PATTERNS = [
    /\bwill\s+(?:provide\s+)?sponsor(?:ship)?\b/i,
    /\bsponsorship\s+(?:is\s+)?available\b/i,
    /\bvisa\s+sponsor(?:ship)?\s+(?:is\s+)?(?:provided|available|offered)\b/i,
    /\bH-?1B\s+sponsor(?:ship)?\s+(?:is\s+)?(?:available|provided|offered)\b/i,
]

function detectH1BSponsorship(text: string): 'Yes' | 'No' | 'N/A' {
    if (!text) return 'N/A'
    for (const pattern of H1B_NO_SPONSOR_PATTERNS) {
        if (pattern.test(text)) return 'No'
    }
    for (const pattern of H1B_WILL_SPONSOR_PATTERNS) {
        if (pattern.test(text)) return 'Yes'
    }
    return 'N/A'
}


// Realistic browser headers to avoid detection
const HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'X-Requested-With': 'XMLHttpRequest',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-CH-UA': '"Chromium";v="122", "Not(A:Brand)";v="24", "Google Chrome";v="122"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AmazonJob {
    id: string
    id_icims: string
    title: string
    description: string
    description_short: string
    basic_qualifications: string
    preferred_qualifications: string
    company_name: string
    city: string
    state: string | null
    location: string
    normalized_location: string
    country_code: string
    job_category: string
    job_family: string
    job_path: string
    job_schedule_type: string
    posted_date: string
    updated_time: string
    url_next_step: string
}

interface ApiResponse {
    error: string | null
    hits: number
    jobs: AmazonJob[]
}

interface DbJob {
    company_id: number
    external_job_id: string
    title: string
    location: string
    location_type: 'Remote' | 'Hybrid' | 'Onsite' | null
    department: string
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
    posted_date: string
    description: string
    summary: string
    required_qualifications: string[]
    preferred_qualifications: string[]
    pay_range: string
    security_clearance: 'Yes' | 'No' | 'N/A'
    h1b_sponsorship: 'Yes' | 'No' | 'N/A'
    job_url: string
    is_active: boolean
    structuredSourceFields?: {
        department?: string | null
        required_qualifications?: string[]
        preferred_qualifications?: string[]
    }
    sourceHints?: Record<string, string>
}

interface CompanyRecord {
    id: number
    name: string
    careers_url: string | null
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function randomDelay(): number {
    return CONFIG.delayMinMs + Math.random() * (CONFIG.delayMaxMs - CONFIG.delayMinMs)
}

/**
 * Check if a country code/name matches USA
 */
function isUSA(countryCode: string): boolean {
    return USA_COUNTRY_CODES.has(countryCode)
}

/**
 * Strip HTML tags and convert <br/> to newlines
 */
function cleanHtml(html: string): string {
    if (!html) return ''
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|ul|ol|li|span|a|strong|em|b|i|h[1-6])[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * Parse qualifications text (separated by <br/>) into bullet points
 */
function parseQualifications(text: string): string[] {
    if (!text) return []
    return text
        .split(/<br\s*\/?>/gi)
        .map(q => q.replace(/<[^>]+>/g, '').trim())
        .filter(q => q.length > 0 && q !== '-')
        .map(q => q.startsWith('- ') ? q.substring(2) : q)
        .map(q => q.startsWith('• ') ? q.substring(2) : q)
}

/**
 * Extract pay range from the description or preferred qualifications
 */
function extractPayRange(description: string): string {
    const patterns = [
        /\$?([\d,]+(?:\.\d{2})?)\s*-\s*\$?([\d,]+(?:\.\d{2})?)\s*USD\s*(annually|hourly)/gi,
        /USA[^-]*?-\s*([\d,]+(?:\.\d{2})?)\s*-\s*([\d,]+(?:\.\d{2})?)\s*USD\s*(annually|hourly)/gi,
    ]

    for (const pattern of patterns) {
        const match = pattern.exec(description)
        if (match) {
            return match[0].trim()
        }
    }
    return 'Not specified'
}

/**
 * Parse "February 18, 2026" into ISO date string (YYYY-MM-DD)
 */
function parsePostedDate(dateStr: string): string | null {
    const parsed = new Date(dateStr)
    if (isNaN(parsed.getTime())) {
        console.warn(`⚠️  Could not parse date: "${dateStr}"`)
        return null
    }
    return parsed.toISOString().split('T')[0]
}

/**
 * Check if a date string is within the last N days
 */
function isWithinDays(dateStr: string | null, days: number): boolean {
    if (!dateStr) return false
    const date = new Date(dateStr)
    const now = new Date()
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return date >= cutoff
}

/**
 * Determine location type from job data
 */
function determineLocationType(job: AmazonJob): 'Remote' | 'Hybrid' | 'Onsite' | null {
    const title = job.title.toLowerCase()
    const location = (job.location || '').toLowerCase()
    const city = (job.city || '').toLowerCase()

    if (title.includes('remote') || location.includes('virtual') || city.includes('virtual')) {
        return 'Remote'
    }
    if (title.includes('hybrid')) {
        return 'Hybrid'
    }
    return /on[- ]?site|in[- ]?office/i.test(`${job.title} ${job.description}`) ? 'Onsite' : null
}

/**
 * Create a short summary from the description
 */
function createSummary(description: string): string {
    const cleaned = cleanHtml(description)
    const sentences = cleaned.split(/[.!?]\s+/).slice(0, 2).join('. ')
    if (sentences.length > 200) {
        return sentences.substring(0, 197) + '...'
    }
    return sentences + '.'
}

/**
 * Convert a careers search URL to the JSON API endpoint.
 * e.g. "https://amazon.jobs/en/search?offset=0&..." → "https://amazon.jobs/en/search.json?..."
 */
function toJsonApiUrl(searchUrl: string): { baseUrl: string; params: URLSearchParams } {
    const url = new URL(searchUrl)

    // Convert /search or /search? to /search.json
    const pathname = url.pathname.replace(/\/search\/?$/, '/search.json')
    const baseUrl = `${url.protocol}//${url.host}${pathname}`

    // Carry over all query params from the stored URL
    const params = url.searchParams

    // Override result_limit for efficiency (100 per page instead of 10)
    params.set('result_limit', String(CONFIG.resultLimit))

    // Remove offset — we'll control pagination ourselves
    params.delete('offset')

    return { baseUrl, params }
}

// ─── API Fetching ────────────────────────────────────────────────────────────

async function fetchPage(baseUrl: string, params: URLSearchParams, offset: number): Promise<ApiResponse> {
    const pageParams = new URLSearchParams(params)
    pageParams.set('offset', String(offset))

    const url = `${baseUrl}?${pageParams.toString()}`

    // Set Referer based on the actual domain
    const refererUrl = new URL(baseUrl)
    const headers = {
        ...HEADERS,
        'Referer': `${refererUrl.protocol}//${refererUrl.host}/en/search`,
    }

    const response = await fetchSource(url, { headers })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json() as Promise<ApiResponse>
}

// ─── Database Operations ─────────────────────────────────────────────────────

/**
 * Get the company record from the database
 */
async function getCompany(): Promise<CompanyRecord> {
    const { data, error } = await supabase
        .from('companies')
        .select('id, name, careers_url')
        .eq('name', CONFIG.companyName)
        .maybeSingle()

    if (error) {
        console.error('❌ Error looking up company:', error)
        throw error
    }

    if (!data) {
        throw new Error(`Company "${CONFIG.companyName}" not found in database. Please add it first.`)
    }

    return data as CompanyRecord
}



// ─── Job Processing ──────────────────────────────────────────────────────────

function processJobForDb(job: AmazonJob, companyId: number): DbJob {
    const fullText = `${job.description} ${job.basic_qualifications} ${job.preferred_qualifications}`
    const postedDate = parsePostedDate(job.posted_date)

    return {
        company_id: companyId,
        external_job_id: job.id_icims, // Amazon's unique job ID
        title: job.title.trim(),
        location: job.normalized_location || job.location || 'Not specified',
        location_type: determineLocationType(job),
        department: normalizeDepartment(job.job_category || 'General', job.title.trim()),
        employment_type: determineEmploymentType(`${job.job_schedule_type} ${job.title}`),
        posted_date: postedDate || new Date().toISOString().split('T')[0],
        description: cleanHtml(job.description),
        summary: createSummary(job.description),
        required_qualifications: parseQualifications(job.basic_qualifications),
        preferred_qualifications: parseQualifications(job.preferred_qualifications),
        pay_range: extractPayRange(fullText),
        security_clearance: detectSecurityClearance(fullText),
        h1b_sponsorship: detectH1BSponsorship(fullText),
        structuredSourceFields: {
            department: job.job_category || null,
            required_qualifications: parseQualifications(job.basic_qualifications),
            preferred_qualifications: parseQualifications(job.preferred_qualifications),
        },
        sourceHints: { scheduleType: job.job_schedule_type || '' },
        job_url: `https://amazon.jobs${job.job_path}`,
        is_active: true,
    }
}

// ─── Scrape a Single Career URL ──────────────────────────────────────────────

async function scrapeCareerUrl(
    careerUrl: string,
    urlIndex: number,
    companyId: number,
    seenJobIds: Set<string>,
): Promise<DbJob[]> {
    console.log(`\n🔗 Career URL ${urlIndex}: ${careerUrl}`)

    const { baseUrl, params } = toJsonApiUrl(careerUrl)
    console.log(`   📡 API endpoint: ${baseUrl}`)

    const collectedJobs: DbJob[] = []
    let offset = 0
    let totalHits = 0
    let pageNum = 1
    let retryCount = 0
    const maxRetries = 3

    while (pageNum <= CONFIG.maxPages) {
        try {
            console.log(`📄 Page ${pageNum} (offset ${offset})...`)
            const response = await fetchPage(baseUrl, params, offset)

            if (response.error) {
                console.error(`❌ API error: ${response.error}`)
                break
            }

            if (pageNum === 1) {
                totalHits = response.hits
                console.log(`📊 Total matching jobs from this URL: ${totalHits.toLocaleString()}`)
            }

            if (!response.jobs || response.jobs.length === 0) {
                console.log('📭 No more jobs returned. Done with this URL.')
                break
            }

            // Reset retry count on successful request
            retryCount = 0

            let pageJobCount = 0
            let pageSkipCount = 0
            let usaJobsOnPage = 0

            for (const rawJob of response.jobs) {
                // Filter: USA only (API ignores the country filter)
                if (!isUSA(rawJob.country_code)) {
                    pageSkipCount++
                    continue
                }

                usaJobsOnPage++

                // Deduplicate across URLs and pages
                if (seenJobIds.has(rawJob.id_icims)) {
                    pageSkipCount++
                    continue
                }

                const postedDate = parsePostedDate(rawJob.posted_date)

                if (!isWithinDays(postedDate, CONFIG.dateWindowDays)) {
                    pageSkipCount++
                    continue
                }

                seenJobIds.add(rawJob.id_icims)
                const processed = processJobForDb(rawJob, companyId)
                collectedJobs.push(processed)
                pageJobCount++
            }

            console.log(`   ✅ ${pageJobCount} jobs collected, ${pageSkipCount} skipped (${usaJobsOnPage} USA on page)`)

            // Stop if we've passed all available results
            if (offset + response.jobs.length >= totalHits) {
                console.log('📭 All API results exhausted for this URL. Done.')
                break
            }

            // Move to next page
            offset += CONFIG.resultLimit
            pageNum++

            // Rate limiting: random delay
            if (response.jobs.length === CONFIG.resultLimit) {
                const delay = randomDelay()
                console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`)
                await sleep(delay)
            } else {
                console.log('📭 Last page reached (partial results). Done.')
                break
            }
        } catch (error) {
            retryCount++
            console.error(`❌ Error on page ${pageNum}:`, error)
            if (retryCount >= maxRetries) {
                console.error(`❌ Max retries (${maxRetries}) reached. Moving to next URL.`)
                break
            }
            console.log(`   🔄 Retrying in 10s (attempt ${retryCount}/${maxRetries})...`)
            await sleep(10000)
        }
    }

    console.log(`   📊 Collected ${collectedJobs.length} jobs from URL ${urlIndex}`)
    return collectedJobs
}

// ─── Main Scraper ────────────────────────────────────────────────────────────

async function scrapeAmazonJobs() {
    console.log('🚀 Amazon Jobs Scraper → Supabase')
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA, Full-Time, < 1 year experience`)
    console.log(`🗄️  Target: Supabase database\n`)

    // ─── Step 1: Get Company and Career URL ────────────────────────────────
    const company = await getCompany()
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    if (!company.careers_url) {
        console.error('❌ No career URL found for this company.')
        console.error('   Set careers_url in the companies table.')
        process.exit(1)
    }

    console.log(`🔗 Career URL: ${company.careers_url}`)

    // ─── Step 2: Scrape Career URL ─────────────────────────────────────────
    const seenJobIds = new Set<string>()
    const allJobs = await scrapeCareerUrl(company.careers_url, 1, company.id, seenJobIds)

    console.log(`\n📊 Total jobs collected: ${allJobs.length}`)

    if (allJobs.length === 0) {
        console.log('⚠️  No jobs found. Check your career URLs and filters.')
        return
    }

    // ─── Step 3: Upsert into Database ──────────────────────────────────────
    console.log(`\n🗄️  Upserting ${allJobs.length} jobs into Supabase (dedup by external_job_id)...`)

    const upsertedCount = await upsertJobsBatch(allJobs)

    // ─── Step 4: Verify ────────────────────────────────────────────────────
    const { count: finalCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('is_active', true)

    console.log(`\n✅ Done!`)
    console.log(`📊 Summary:`)
    console.log(`   • Career URL: ${company.careers_url}`)
    console.log(`   • Jobs collected: ${allJobs.length}`)
    console.log(`   • Jobs upserted to DB: ${upsertedCount}`)
    console.log(`   • Total ${company.name} jobs in DB: ${finalCount}`)
    console.log(`   • Date range: Last ${CONFIG.dateWindowDays} days`)
}

// ─── Run ─────────────────────────────────────────────────────────────────────

withScraperRun(CONFIG.companyName, scrapeAmazonJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
