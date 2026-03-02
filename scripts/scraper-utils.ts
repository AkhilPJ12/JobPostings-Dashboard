/**
 * Shared Scraper Utilities
 *
 * Common utilities used by all job scrapers:
 * - Security clearance detection
 * - H1B sponsorship detection
 * - Location validation
 * - Date parsing and filtering
 * - HTML cleaning
 * - Database operations (upsert, getCompany)
 * - Rate limiting
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase environment variables.')
    console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local')
    process.exit(1)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DbJob {
    company_id: number
    external_job_id: string
    title: string
    location: string
    location_type: 'Remote' | 'Hybrid' | 'Onsite'
    department: string
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
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
}

export interface CompanyRecord {
    id: number
    name: string
    careers_url: string | null
    careers_url_1: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const USA_LOCATION_PATTERNS = new Set([
    'USA', 'US', 'United States', 'United States of America',
    'U.S.', 'U.S.A.',
])

export const US_STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC',
])

export const US_STATE_NAMES = new Set([
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
])

export const BROWSER_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
}

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
    /\bclearance(?:d)?\s+(?:at\s+the\s+)?(?:TS\/SCI|top\s*secret|secret|confidential)\s+level\b/i,
    /\bPublic\s+Trust\b/i,
    /\bSensitive\s+Compartmented\s+Information\b/i,
]

/**
 * Detect if a job description mentions security clearance requirements.
 * Returns 'Yes' if clearance is required/mentioned, 'No' otherwise.
 */
export function detectSecurityClearance(text: string): 'Yes' | 'No' {
    if (!text) return 'No'
    for (const pattern of SECURITY_CLEARANCE_PATTERNS) {
        if (pattern.test(text)) return 'Yes'
    }
    return 'No'
}

// ─── H1B Sponsorship Detection ───────────────────────────────────────────────

const H1B_NO_SPONSOR_PATTERNS = [
    /\b(?:not|unable\s+to|cannot|will\s+not|does\s+not|won'?t)\s+(?:provide\s+)?(?:immigration\s+)?sponsor(?:ship)?\b/i,
    /\bno\s+(?:immigration\s+)?sponsor(?:ship)?\b/i,
    /\b(?:without|excluding)\s+(?:immigration\s+)?sponsor(?:ship)?\b/i,
    /\bnot\s+(?:be\s+)?sponsor(?:ed|ing)?\b/i,
    /\bU\.?S\.?\s+citizen(?:ship)?\s+(?:is\s+)?required\b/i,
    /\bmust\s+be\s+(?:a\s+)?(?:U\.?S\.?\s+)?citizen\b/i,
    /\bauthorized\s+to\s+work\s+(?:in\s+the\s+)?(?:U\.?S\.?|United\s+States)\s+(?:without\s+(?:future\s+)?sponsor(?:ship)?)\b/i,
    /\bpermanent\s+resident\s+(?:status\s+)?(?:is\s+)?required\b/i,
    /\bgreencard\s+(?:holder\s+)?required\b/i,
    /\brequire(?:s|d)?\s+(?:current\s+)?(?:U\.?S\.?\s+)?work\s+authorization\b/i,
    /\bnot\s+eligible\s+for\s+(?:employment\s+)?visa\s+sponsor(?:ship)?\b/i,
]

const H1B_WILL_SPONSOR_PATTERNS = [
    /\bwill\s+(?:provide\s+)?sponsor(?:ship)?\b/i,
    /\bsponsorship\s+(?:is\s+)?available\b/i,
    /\bvisa\s+sponsor(?:ship)?\s+(?:is\s+)?(?:provided|available|offered)\b/i,
    /\bopen\s+to\s+sponsor(?:ship)?\b/i,
    /\bH-?1B\s+sponsor(?:ship)?\s+(?:is\s+)?(?:available|provided|offered)\b/i,
]

/**
 * Detect H1B sponsorship stance from job description.
 * Returns 'Yes' (will sponsor), 'No' (won't sponsor), or 'N/A' (not mentioned).
 */
export function detectH1BSponsorship(text: string): 'Yes' | 'No' | 'N/A' {
    if (!text) return 'N/A'

    // Check "won't sponsor" patterns first (more common)
    for (const pattern of H1B_NO_SPONSOR_PATTERNS) {
        if (pattern.test(text)) return 'No'
    }

    // Check "will sponsor" patterns
    for (const pattern of H1B_WILL_SPONSOR_PATTERNS) {
        if (pattern.test(text)) return 'Yes'
    }

    return 'N/A'
}

// ─── Location Utilities ─────────────────────────────────────────────────────

/**
 * Check if a country code/name matches USA.
 */
export function isUSA(countryCode: string): boolean {
    if (!countryCode) return false
    const normalized = countryCode.trim()
    return USA_LOCATION_PATTERNS.has(normalized)
}

/**
 * Check if a location string contains a US location.
 * Handles formats like "San Francisco, CA", "New York, NY, USA", "United States", etc.
 */
export function isUSLocation(location: string): boolean {
    if (!location) return false
    const upper = location.toUpperCase().trim()

    // Direct country match
    if (USA_LOCATION_PATTERNS.has(location.trim())) return true
    if (upper.includes('UNITED STATES') || upper.includes('USA') || upper.includes('U.S.')) return true

    // Check for US state codes (e.g., "San Francisco, CA")
    const parts = location.split(/[,\s]+/).map(p => p.trim())
    for (const part of parts) {
        if (US_STATE_CODES.has(part.toUpperCase())) return true
    }

    // Check for US state names
    const lowerLoc = location.toLowerCase()
    for (const state of US_STATE_NAMES) {
        if (lowerLoc.includes(state.toLowerCase())) return true
    }

    return false
}

// ─── Date Utilities ──────────────────────────────────────────────────────────

/**
 * Parse various date formats into ISO date string (YYYY-MM-DD).
 * Handles: "February 18, 2026", "2026-02-18", "02/18/2026", "18 Feb 2026",
 * timestamps (epoch ms), ISO 8601, etc.
 */
export function parsePostedDate(dateStr: string | number | null | undefined): string | null {
    if (!dateStr) return null

    // Epoch timestamp (ms or s)
    if (typeof dateStr === 'number') {
        const ts = dateStr > 1e12 ? dateStr : dateStr * 1000
        return new Date(ts).toISOString().split('T')[0]
    }

    const str = String(dateStr).trim()
    if (!str) return null

    // ISO 8601 or date-like string
    const date = new Date(str)
    if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
    }

    // "February 18, 2026" format
    const longMatch = str.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)
    if (longMatch) {
        const d = new Date(`${longMatch[1]} ${longMatch[2]}, ${longMatch[3]}`)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }

    // "18 Feb 2026" format
    const shortMatch = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
    if (shortMatch) {
        const d = new Date(`${shortMatch[2]} ${shortMatch[1]}, ${shortMatch[3]}`)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }

    return null
}

/**
 * Check if a date is within the last N days, OR in the future (for Salesforce-style future postings).
 */
export function isWithinDaysOrFuture(dateStr: string | null, days: number): boolean {
    if (!dateStr) return false
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return false

    const now = new Date()
    // Allow future dates (Salesforce posts jobs with future dates)
    if (date > now) return true

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return date >= cutoff
}

/**
 * Check if a date is within the last N days (strict, no future dates).
 */
export function isWithinDays(dateStr: string | null, days: number): boolean {
    if (!dateStr) return false
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return false

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return date >= cutoff
}

// ─── Text Utilities ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags and convert <br/> to newlines.
 */
export function cleanHtml(html: string): string {
    if (!html) return ''
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|li|ul|ol|h[1-6]|span|a|strong|em|b|i)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * Create a short summary from description text.
 */
export function createSummary(description: string, maxLen = 200): string {
    const clean = cleanHtml(description)
    if (clean.length <= maxLen) return clean
    return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '...'
}

/**
 * Parse qualifications text into an array of bullet points.
 */
export function parseQualifications(text: string | null | undefined): string[] {
    if (!text) return []
    const clean = cleanHtml(text)
    return clean
        .split(/[\n•·\-–—]/)
        .map(q => q.trim())
        .filter(q => q.length > 5)
}

/**
 * Extract pay range from description text.
 */
export function extractPayRange(text: string): string {
    if (!text) return 'Not specified'
    const patterns = [
        /\$[\d,]+(?:\.\d{2})?\s*(?:[-–—to]+)\s*\$[\d,]+(?:\.\d{2})?(?:\s*(?:per|\/)\s*(?:year|hr|hour|annum))?/i,
        /(?:salary|compensation|pay|base)\s*(?:range)?[:\s]*\$[\d,]+(?:\.\d{2})?\s*[-–—to]+\s*\$[\d,]+(?:\.\d{2})?/i,
        /\$[\d,]+(?:\.\d{2})?\s*[-–—]\s*\$[\d,]+(?:\.\d{2})?/i,
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[0].trim()
    }
    return 'Not specified'
}

/**
 * Determine location type from text.
 */
export function determineLocationType(
    locationText: string,
    descriptionText?: string
): 'Remote' | 'Hybrid' | 'Onsite' {
    const combined = `${locationText} ${descriptionText || ''}`.toLowerCase()
    if (combined.includes('remote') && combined.includes('hybrid')) return 'Hybrid'
    if (combined.includes('remote')) return 'Remote'
    if (combined.includes('hybrid')) return 'Hybrid'
    return 'Onsite'
}

/**
 * Determine employment type from text.
 */
export function determineEmploymentType(
    text: string
): 'Full-time' | 'Part-time' | 'Contract' | 'Internship' {
    const lower = text.toLowerCase()
    if (lower.includes('intern')) return 'Internship'
    if (lower.includes('contract') || lower.includes('temp')) return 'Contract'
    if (lower.includes('part-time') || lower.includes('part time')) return 'Part-time'
    return 'Full-time'
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function randomDelay(min = 2000, max = 5000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

// ─── Database Operations ─────────────────────────────────────────────────────

/**
 * Get a company record from the database by name.
 */
export async function getCompany(companyName: string): Promise<CompanyRecord> {
    const { data, error } = await supabase
        .from('companies')
        .select('id, name, careers_url, careers_url_1')
        .eq('name', companyName)
        .maybeSingle()

    if (error) {
        console.error(`❌ Error fetching company "${companyName}":`, error)
        process.exit(1)
    }

    if (!data) {
        console.error(`❌ Company "${companyName}" not found in the database.`)
        process.exit(1)
    }

    return data as CompanyRecord
}

/**
 * Upsert jobs in batches using external_job_id for deduplication.
 */
export async function upsertJobsBatch(jobs: DbJob[], batchSize = 50): Promise<number> {
    let totalUpserted = 0
    let batchNum = 1

    for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize)

        const { error } = await supabase
            .from('jobs')
            .upsert(batch, {
                onConflict: 'external_job_id',
                ignoreDuplicates: false,
            })

        if (error) {
            console.error(`   ❌ Batch ${batchNum} error:`, error.message)
        } else {
            totalUpserted += batch.length
            console.log(`   📦 Batch ${batchNum}: ${batch.length} upserted (${totalUpserted}/${jobs.length})`)
        }
        batchNum++
    }

    return totalUpserted
}

/**
 * Get total job count for a company.
 */
export async function getCompanyJobCount(companyId: number): Promise<number> {
    const { count } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true)

    return count || 0
}

/**
 * Log scraper summary.
 */
export function logSummary(companyName: string, collected: number, upserted: number, dbCount: number, careerUrl: string) {
    console.log(`\n✅ Done!`)
    console.log(`📊 Summary:`)
    console.log(`   • Company: ${companyName}`)
    console.log(`   • Career URL: ${careerUrl}`)
    console.log(`   • Jobs collected: ${collected}`)
    console.log(`   • Jobs upserted to DB: ${upserted}`)
    console.log(`   • Total ${companyName} jobs in DB: ${dbCount}`)
    console.log(`   • Date range: Last 14 days`)
}
