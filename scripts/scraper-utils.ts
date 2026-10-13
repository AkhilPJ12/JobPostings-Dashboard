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

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import type { Database, Json } from '../lib/supabase'
import { getSourceFailures, resetSourceFailures } from '../lib/modules/ingestion/health'
import {
    prepareJobForAiUpsert,
    type AiEnrichmentStatus,
    type ExistingAiJobRecord,
    type StructuredSourceFields,
} from '../lib/modules/ingestion/source-payload'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

let supabaseAdminClient: SupabaseClient<Database> | null = null

export function getSupabaseAdminClient(): SupabaseClient<Database> {
    if (supabaseAdminClient) return supabaseAdminClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error(
            'Missing scraper Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        )
    }

    supabaseAdminClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })
    return supabaseAdminClient
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
    get(_target, prop) {
        const client = getSupabaseAdminClient()
        const value = (client as any)[prop]
        return typeof value === 'function' ? value.bind(client) : value
    },
})

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DbJob {
    company_id: number
    external_job_id: string
    title: string
    location: string
    location_type: 'Remote' | 'Hybrid' | 'Onsite' | null
    department: string
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
    posted_date: string
    end_date?: string | null
    description: string
    summary: string
    required_qualifications: string[]
    preferred_qualifications: string[]
    pay_range: string
    security_clearance: 'Yes' | 'No' | 'N/A'
    h1b_sponsorship: 'Yes' | 'No' | 'N/A'
    job_url: string
    is_active: boolean
    raw_job_payload?: Json | null
    source_content_hash?: string | null
    ai_enrichment_status?: AiEnrichmentStatus | null
    ai_enrichment_model?: string | null
    ai_enriched_at?: string | null
    ai_enrichment_error?: string | null
    ai_enrichment_attempts?: number
    sourceDateProvenance?: 'source' | 'first_seen'
    structuredSourceFields?: StructuredSourceFields
    sourceHints?: Record<string, string>
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
export function detectSecurityClearance(text: string): 'Yes' | 'No' | 'N/A' {
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
 * Check if a date is within the last N days, OR slightly in the future (up to 7 days).
 * Dates more than 7 days in the future are rejected as likely invalid (e.g., expiry dates).
 */
export function isWithinDaysOrFuture(dateStr: string | null, days: number): boolean {
    if (!dateStr) return false
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return false

    const now = new Date()
    // Allow future dates up to 7 days (some companies pre-post jobs a few days early)
    // Reject dates further in the future — likely expiry/closing dates, not posting dates
    const maxFuture = new Date()
    maxFuture.setDate(maxFuture.getDate() + 7)
    if (date > maxFuture) return false
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
        // Strip script and style tags with their content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|li|ul|ol|h[1-6]|span|a|strong|em|b|i)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Strip remaining JS code patterns that leak through
        .replace(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
        .replace(/window\.\w+[\w.]*\([^)]*\)/g, '')
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
): 'Remote' | 'Hybrid' | 'Onsite' | null {
    const combined = `${locationText} ${descriptionText || ''}`.toLowerCase()
    if (combined.includes('remote') && combined.includes('hybrid')) return 'Hybrid'
    if (combined.includes('remote')) return 'Remote'
    if (combined.includes('hybrid')) return 'Hybrid'
    if (/\bon[- ]?site\b|\bin[- ]?office\b|\bin person\b/i.test(combined)) return 'Onsite'
    return null
}

/**
 * Determine employment type from text.
 */
export function determineEmploymentType(
    text: string
): 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null {
    const lower = text.toLowerCase()
    if (lower.includes('intern')) return 'Internship'
    if (lower.includes('contract') || lower.includes('temp')) return 'Contract'
    if (lower.includes('part-time') || lower.includes('part time')) return 'Part-time'
    if (lower.includes('full-time') || lower.includes('full time')) return 'Full-time'
    return null
}

// ─── Department Normalization ────────────────────────────────────────────

/**
 * Standard department categories (15 total).
 * Every job gets mapped to one of these.
 */
export const STANDARD_DEPARTMENTS = [
    'Engineering',
    'Data & Analytics',
    'Product Management',
    'Design & UX',
    'Sales & Business Development',
    'Marketing & Communications',
    'Consulting & Advisory',
    'Finance & Accounting',
    'Operations',
    'Human Resources',
    'Legal & Compliance',
    'Customer Success & Support',
    'Research & Science',
    'IT & Infrastructure',
    'General & Administrative',
] as const

export type StandardDepartment = typeof STANDARD_DEPARTMENTS[number]

/**
 * Keyword rules for department classification.
 * Checked against lowercased department + title text.
 * Order matters: first match wins.
 */
const DEPARTMENT_RULES: { dept: StandardDepartment; keywords: RegExp }[] = [
    { dept: 'Research & Science', keywords: /\b(?:research|scientist|r&d|applied\s*science|physics|biology|chemistry|lab\b|laboratory|science\b)/i },
    { dept: 'Finance & Accounting', keywords: /\b(?:financ|accounting|accountant|controller|treasury|tax\b|audit|revenue\s+accounting|bank(?:ing|er)|investment|asset\s+(?:manag|servic)|cash\s+manag|capital\s+market|credit|underwrit|actuari|loan|mortgage|wealth\s+manag|portfolio|fund\s+manag|compliance\s+(?:officer|analyst))/i },
    { dept: 'Data & Analytics', keywords: /\b(?:data\s+(?:scien|engineer|analy)|analytics|machine\s*learning|big\s*data|business\s+intelligence|ai\b|artificial\s+intelligence|deep\s+learning|nlp\b|computer\s+vision|ml\b|analysts?\b)/i },
    { dept: 'Design & UX', keywords: /\b(?:design(?:er)?|ux|ui\b|user\s+experience|user\s+interface|creative|graphic|visual|art\b|artist|illustrat|motion|brand\s+design|audio|video|photo|media\s+produc)/i },
    { dept: 'Product Management', keywords: /\b(?:product\s+manag|program\s+manag|tpm\b|technical\s+program|product\s+lead|product\s+director|product\s+owner|scrum\s+master|agile\s+coach|(?<!construction\s+)project\s+manag)/i },
    { dept: 'Sales & Business Development', keywords: /\b(?:sales|business\s+develop|business\s+&?\s*merchant|account\s+(?:manag|execut|service)|merchant|partnership|revenue|quota|territory|client\s+(?:sales|acquisition)|commercial|deal\b|pricing|bid\b|advisor|relationship\s+banker)/i },
    { dept: 'Engineering', keywords: /\b(?:engineer|software|develop|architect|devops|sre\b|site\s+reliab|platform|infrastructure|backend|frontend|full[\s-]*stack|mobile\s+dev|ios\s+dev|android\s+dev|firmware|embedded|systems?\s+software|cloud\s+(?:solution|engineer|network)|coding|programming|qa\b|quality\s+assurance|test\s+(?:engineer|dev)|sdet\b|automation\s+eng|hardware\b|silicon|semiconductor|chip\s+design|vlsi|asic|fpga|mechanical\s+eng|electrical\s+eng|robotics|autonomous|server\b|gpu|cpu|cuda|kernel|driver|diagnostic|debug|compute|npi\b|compliance\s+eng|technician)/i },
    { dept: 'IT & Infrastructure', keywords: /\b(?:it\s+(?:support|admin|manager|infra|operations|service)|information\s+technology|helpdesk|help\s+desk|network\s+(?:admin|engineer|ops)|security\s+(?:engineer|analyst|ops)|cyber|infosec|soc\s+analyst|cloud\s+admin|sysadmin|system\s+admin|database\s+admin|dba\b)/i },
    { dept: 'Consulting & Advisory', keywords: /\b(?:consult|advisory\b|strateg(?:y|ic)\s+consult|management\s+consult|solution\s+architect|client\s+advisory|capital\s+advisory)/i },
    { dept: 'Marketing & Communications', keywords: /\b(?:marketing|communications?|content|copywrite|public\s+relations|pr\b|social\s+media|seo\b|sem\b|growth\s+market|brand\s+manag|event\s+manag|campaign|digital\s+market|demand\s+gen)/i },
    { dept: 'Customer Success & Support', keywords: /\b(?:customer\s+(?:success|support|service|experience)|client\s+(?:service|support|success|operations|delivery|management|relation)|technical\s+support|support\s+engineer|field\s+service|help\s+center|contact\s+center|call\s+center|collections\b)/i },
    { dept: 'Legal & Compliance', keywords: /\b(?:legal|attorney|lawyer|counsel|compliance|regulatory|governance|risk\s+(?:manag|analy|officer)|ccor\b|conflicts?|ethics|fraud|anti[\s-]*money|aml\b|kyc\b|sanctions)/i },
    { dept: 'Human Resources', keywords: /\b(?:human\s+resources|hr\b|recruit|talent\s+(?:acqui|manag)|people\s+(?:ops|partner|manag)|compensation|benefits\s+(?:admin|analy|manag)|payroll|workforce|diversity|learning\s+&\s+dev|training\s+(?:manag|coord)|employee\s+rel)/i },
    { dept: 'Operations', keywords: /\b(?:operations|supply\s+chain|logistics|procurement|sourcing|warehouse|fulfillment|manufactur|production|(?:branch|capacity)\s+manag|capacity|vendor|commodity|buying|instock|inventory|facilities|construction|real\s+estate|workplace|fleet|shipping|distribution|process\s+improv|lean\b|six\s+sigma|community\s+develop)/i },
    { dept: 'General & Administrative', keywords: /\b(?:admin(?:istrat)?|executive\s+assist|office\s+admin|receptionist|secretary|coordinator|clerk|business\s+support|business\s+manag|transformation|resiliency)/i },
]

/**
 * Normalize a raw department string (+ optional job title) into a standard category.
 * Uses keyword matching against department first, then title as fallback.
 */
export function normalizeDepartment(rawDepartment: string, jobTitle?: string): StandardDepartment {
    const dept = (rawDepartment || '').trim()
    const title = (jobTitle || '').trim()

    // First try matching on the raw department value (unless it's generic)
    if (dept && dept !== 'General' && dept !== 'Unknown') {
        for (const rule of DEPARTMENT_RULES) {
            if (rule.keywords.test(dept)) return rule.dept
        }
    }

    // Fallback: match on job title
    if (title) {
        for (const rule of DEPARTMENT_RULES) {
            if (rule.keywords.test(title)) return rule.dept
        }
    }

    // Last resort: try matching combined text
    const combined = `${dept} ${title}`
    for (const rule of DEPARTMENT_RULES) {
        if (rule.keywords.test(combined)) return rule.dept
    }

    return 'General & Administrative'
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
        throw new Error(`Could not fetch company "${companyName}": ${error.message}`)
    }

    if (!data) {
        throw new Error(`Company "${companyName}" not found in the database.`)
    }

    return data as CompanyRecord
}

/**
 * Upsert jobs in batches using external_job_id for deduplication.
 */
let activeScrapeCounters: { eligible: number; written: number } | null = null

export async function upsertJobsBatch(
    jobs: DbJob[],
    batchSize = 50,
    preservePostedDate = false,
): Promise<number> {
    let totalUpserted = 0
    let batchNum = 1

    for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize)
        const externalIds = batch.map(j => j.external_job_id)
        const { data: existingRows, error: lookupError } = await supabase
            .from('jobs')
            .select([
                'external_job_id',
                'posted_date',
                'source_content_hash',
                'ai_enrichment_status',
                'ai_enrichment_model',
                'ai_enriched_at',
                'ai_enrichment_error',
                'ai_enrichment_attempts',
                'title',
                'location_type',
                'department',
                'employment_type',
                'description',
                'summary',
                'required_qualifications',
                'preferred_qualifications',
                'pay_range',
                'security_clearance',
                'h1b_sponsorship',
            ].join(', '))
            .in('external_job_id', externalIds)
        if (lookupError) throw new Error(`Could not load existing jobs: ${lookupError.message}`)

        const existingRecords = (existingRows || []) as unknown as ExistingAiJobRecord[]
        const existingByExternalId = new Map(
            existingRecords.map(row => [row.external_job_id, row])
        )

        const firstSeenIds = batch.filter(job =>
            (preservePostedDate || job.sourceDateProvenance === 'first_seen') &&
            !existingByExternalId.has(job.external_job_id)).map(job => job.external_job_id)
        const identityDates = new Map<string, string>()
        if (firstSeenIds.length) {
            const { data: identities, error: identityError } = await supabase
                .from('job_source_identities').select('external_job_id,first_seen_at')
                .in('external_job_id', firstSeenIds)
            if (identityError) throw new Error(`Could not load first-seen identities: ${identityError.message}`)
            for (const identity of identities || []) {
                identityDates.set(identity.external_job_id, identity.first_seen_at.slice(0, 10))
            }
        }
        const preparedBatch = batch.map(job => prepareJobForAiUpsert(job,
            existingByExternalId.get(job.external_job_id) || null,
            { preservePostedDate, firstSeenDate: identityDates.get(job.external_job_id) }))
            // Once purged, an old undated posting should remain only as a
            // minimal identity record, even if the source still lists it.
            .filter(job => job.is_active || existingByExternalId.has(job.external_job_id))

        if (!preparedBatch.length) {
            console.log(`   📦 Batch ${batchNum}: all ${batch.length} postings are outside the browse window`)
            batchNum++
            continue
        }

        const { error } = await supabase
            .from('jobs')
            .upsert(preparedBatch, {
                onConflict: 'external_job_id',
                ignoreDuplicates: false,
            })

        if (error) {
            throw new Error(`Could not upsert batch ${batchNum}: ${error.message}`)
        } else {
            totalUpserted += preparedBatch.length
            if (activeScrapeCounters) {
                activeScrapeCounters.eligible += preparedBatch.length
                activeScrapeCounters.written += preparedBatch.length
            }
            console.log(`   📦 Batch ${batchNum}: ${preparedBatch.length} upserted (${totalUpserted}/${jobs.length})`)
        }
        batchNum++
    }

    return totalUpserted
}

/**
 * Get total job count for a company.
 */
export async function getCompanyJobCount(companyId: number): Promise<number> {
    const { count, error } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true)

    if (error) throw new Error(`Could not count jobs for company ${companyId}: ${error.message}`)
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

// ─── Job Lifecycle Cleanup ───────────────────────────────────────────────────

/**
 * Deactivate jobs outside the shared public eligibility window.
 * Scheduled orchestration calls this once per run group.
 */
export async function cleanupOldJobs(retentionDays = 14): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (retentionDays - 1))
    const cutoff = cutoffDate.toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]
    const ineligible = `posted_date.lt.${cutoff},posted_date.gt.${today},posted_date.is.null,end_date.lt.${today}`

    // Keep each write below the database statement deadline. The identity
    // table retains first-seen dates when old content is eventually purged.
    let deactivated = 0
    while (true) {
        const { data, error: selectError } = await supabase
            .from('jobs').select('id').eq('is_active', true)
            .or(ineligible).order('id').limit(50)
        if (selectError) throw new Error(`Could not list old jobs: ${selectError.message}`)
        if (!data?.length) break

        const { error, count } = await supabase
            .from('jobs')
            .update({ is_active: false }, { count: 'exact' })
            .in('id', data.map(job => job.id))
            .eq('is_active', true).or(ineligible)
        if (error) throw new Error(`Could not deactivate old jobs: ${error.message}`)
        if (!count) throw new Error('Could not deactivate old jobs: selected rows were not updated')
        deactivated += count
    }
    if (deactivated > 0) {
        console.log(`🧹 Deactivated ${deactivated} jobs outside the ${retentionDays}-day eligibility window`)
    }
    return deactivated
}

/**
 * Permanently delete jobs that have been inactive for a long time.
 * Prevents indefinite storage growth from soft-deleted rows.
 */
export async function purgeInactiveJobs(retentionDays = 180): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays)
    const cutoff = cutoffDate.toISOString()

    // During an additive rollout, scheduled workers may deploy before the
    // database migration is applied. Keep maintenance running with the old
    // criterion until inactive_since_at exists, and make the gap visible.
    let retentionColumn: 'inactive_since_at' | 'updated_at' = 'inactive_since_at'
    const { error: columnError } = await supabase.from('jobs').select('inactive_since_at').limit(1)
    if (columnError) {
        if (columnError.code !== '42703' && columnError.code !== 'PGRST204') {
            throw new Error(`Could not check inactive retention schema: ${columnError.message}`)
        }
        retentionColumn = 'updated_at'
        console.warn('Inactive retention migration is pending; using updated_at until it is applied')
    }

    let purged = 0
    while (true) {
        const { data, error: selectError } = await supabase
            .from('jobs').select('id').eq('is_active', false)
            .lt(retentionColumn, cutoff).order('id').limit(50)
        if (selectError) throw new Error(`Could not list inactive jobs: ${selectError.message}`)
        if (!data?.length) break

        const { error, count } = await supabase
            .from('jobs').delete({ count: 'exact' })
            .in('id', data.map(job => job.id))
            .eq('is_active', false).lt(retentionColumn, cutoff)
        if (error) throw new Error(`Could not purge inactive jobs: ${error.message}`)
        if (!count) throw new Error('Could not purge inactive jobs: selected rows were not deleted')
        purged += count
    }
    if (purged > 0) {
        console.log(`🗑️ Purged ${purged} inactive jobs older than ${retentionDays} days`)
    }
    return purged
}

/**
 * Wrap a scraper's main function to automatically track and persist run status.
 * Usage: withScraperRun('Google', async () => { ... })
 */
export async function withScraperRun(companyName: string, fn: () => Promise<void>): Promise<void> {
    const managed = process.env.SCRAPER_MANAGED_RUN === '1'
    let lease: string | null = null
    if (!managed) {
        const { data, error } = await supabase.rpc('claim_scraper_lease', { p_company: companyName, p_seconds: 900 })
        if (error) throw error
        if (!data) throw new Error(`Another run owns the scraper lease for ${companyName}`)
        lease = data
    }
    activeScrapeCounters = { eligible: 0, written: 0 }
    resetSourceFailures()
    const startedAt = new Date()
    let finished = false
    try {
        if (!managed) await cleanupOldJobs(14)
        await fn()
        const sourceFailures = getSourceFailures()
        if (!managed) {
            const { data, error } = await supabase.rpc('finish_scraper_lease', {
                p_company: companyName, p_token: lease!, p_run_group: `direct-${startedAt.getTime()}`,
                p_status: sourceFailures.length ? 'Partial' : 'Successful', p_started_at: startedAt.toISOString(),
                p_completed_at: new Date().toISOString(), p_error: sourceFailures.join('; '),
            })
            if (error) throw error
            if (!data) throw new Error(`Lost scraper lease for ${companyName}`)
            finished = true
        }
        console.log(`SCRAPE_RESULT_JSON:${JSON.stringify({ company: companyName, fetched: null,
            eligible: activeScrapeCounters.eligible, written: activeScrapeCounters.written,
            rejected: null, complete: sourceFailures.length === 0, errors: sourceFailures })}`)
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errors = [...new Set([...getSourceFailures(), errorMessage])]
        console.log(`SCRAPE_RESULT_JSON:${JSON.stringify({ company: companyName, fetched: null,
            eligible: activeScrapeCounters.eligible, written: activeScrapeCounters.written,
            rejected: null, complete: false, errors })}`)
        if (!managed && !finished && lease) {
            const { error } = await supabase.rpc('finish_scraper_lease', {
                p_company: companyName, p_token: lease, p_run_group: `direct-${startedAt.getTime()}`,
                p_status: activeScrapeCounters.written > 0 ? 'Partial' : 'Error',
                p_started_at: startedAt.toISOString(), p_completed_at: new Date().toISOString(),
                p_error: errorMessage,
            })
            if (error) console.error(`Could not persist ${companyName} status:`, error)
        }
        throw err
    } finally {
        activeScrapeCounters = null
    }
}

/**
 * Parse structured description text into qualifications sections.
 * Works for descriptions that contain headers like "Required Qualifications",
 * "Preferred Qualifications", "Basic Qualifications", etc.
 */
export function parseDescriptionQualifications(text: string): {
    required: string[]
    preferred: string[]
} {
    if (!text) return { required: [], preferred: [] }

    const result = { required: [] as string[], preferred: [] as string[] }

    // Try to find Required/Basic qualifications section
    const reqMatch = text.match(
        /(?:required|basic|minimum)\s+qualifications?\s*[:\-]?\s*([\s\S]*?)(?=(?:preferred|additional|desired|nice.to.have)\s+qualifications?|$)/i
    )
    if (reqMatch) {
        result.required = extractBulletItems(reqMatch[1])
    }

    // Try to find Preferred/Additional qualifications section
    const prefMatch = text.match(
        /(?:preferred|additional|desired|nice.to.have)\s+qualifications?\s*[:\-]?\s*([\s\S]*?)(?=(?:about|responsibilities|what\s+you|additional\s+information|compensation|salary|pay|benefits|equal|eeo|our\s+company|disclaimer|note:)|$)/i
    )
    if (prefMatch) {
        result.preferred = extractBulletItems(prefMatch[1])
    }

    return result
}

/**
 * Extract bullet point items from text. Handles bullet chars, numbered lists, and newline-delimited items.
 */
export function extractBulletItems(text: string): string[] {
    if (!text) return []
    return text
        .split(/\n/)
        .map(line => line.replace(/^[\s•·\-–—*►▪▸◦‣⁃○●■□▶→]+/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(line => line.length > 10)
}

/**
 * Extract list items from HTML content, returning clean text items.
 */
export function extractHtmlListItems(html: string): string[] {
    if (!html) return []
    const items: string[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let match
    while ((match = liRegex.exec(html)) !== null) {
        const text = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim()
        if (text.length > 5) items.push(text)
    }
    return items
}

/**
 * Convert HTML to plain text, preserving block-level structure.
 * Only adds newlines for block elements (p, div, h1-h6, br, li), strips inline tags cleanly.
 */
export function htmlToText(html: string): string {
    if (!html) return ''
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|h[1-6])>/gi, '\n')
        .replace(/<(?:p|div|h[1-6])[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<\/?(ul|ol)[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// ─── Shared Utility Helpers ───────────────────────────────────────────────────

/**
 * Truncate a string to fit within a DB varchar column.
 * Safe default of 250 chars for varchar(255) columns.
 */
export function truncateField(value: string | null | undefined, maxLen = 250): string {
    if (!value) return ''
    return value.length > maxLen ? value.slice(0, maxLen) : value
}

/**
 * Parse MM/DD/YYYY or M/D/YY date format into ISO string.
 * Handles: "03/30/2026" → "2026-03-30", "3/5/26" → "2026-03-05"
 */
export function parseSlashDate(dateStr: string): string | null {
    const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (!m) return null
    let year = m[3]
    if (year.length === 2) year = '20' + year
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/**
 * Parse "DD Mon YYYY" date format into ISO string.
 * Handles: "30 Mar 2026" → "2026-03-30"
 */
export function parseDayMonthYear(dateStr: string): string | null {
    const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const m = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i)
    if (!m) return null
    const month = months[m[2].toLowerCase()]
    if (!month) return null
    return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
}

/**
 * Parse relative date text like "Posted today", "Posted 3 days ago",
 * "Posted yesterday", or an absolute date after "Posted on".
 */
export function parseRelativePostedDate(text: string | null | undefined): string | null {
    if (!text) return null
    const raw = text.trim()
    if (!raw) return null
    if (/posted\s+today/i.test(raw)) return new Date().toISOString().split('T')[0]
    if (/posted\s+yesterday/i.test(raw)) {
        const d = new Date(); d.setDate(d.getDate() - 1)
        return d.toISOString().split('T')[0]
    }
    const daysAgo = raw.match(/posted\s+(\d+)\s+days?\s+ago/i)
    if (daysAgo) {
        const d = new Date(); d.setDate(d.getDate() - Number(daysAgo[1]))
        return d.toISOString().split('T')[0]
    }
    const cleaned = raw.replace(/^posted\s+on\s+/i, '').replace(/^posted\s+/i, '').trim()
    return parsePostedDate(cleaned)
}

/**
 * Launch a headless browser with standard scraper configuration.
 * Returns { browser, context } — caller must close browser in finally block.
 */
export async function launchBrowser(options?: {
    viewport?: { width: number; height: number }
}) {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: options?.viewport ?? { width: 1280, height: 900 },
    })
    context.setDefaultTimeout(30000)
    context.setDefaultNavigationTimeout(45000)
    return { browser, context }
}
