import { createHash } from 'crypto'
import type { Json } from '../../supabase'

export type AiEnrichmentStatus = 'pending' | 'enriched' | 'failed'
export type YesNoNa = 'Yes' | 'No' | 'N/A'
export type LocationType = 'Remote' | 'Hybrid' | 'Onsite'
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship'

export interface StructuredSourceFields {
    summary?: string | null
    location_type?: LocationType | null
    department?: string | null
    employment_type?: EmploymentType | null
    pay_range?: string | null
    security_clearance?: 'Yes' | 'No' | null
    h1b_sponsorship?: 'Yes' | 'No' | null
    required_qualifications?: string[]
    preferred_qualifications?: string[]
}

export interface AiUpsertJob {
    company_id: number
    external_job_id: string
    title: string
    location: string
    location_type: LocationType | null
    department: string | null
    employment_type: EmploymentType | null
    posted_date: string
    end_date?: string | null
    description: string
    summary: string | null
    required_qualifications: string[]
    preferred_qualifications: string[]
    pay_range: string | null
    security_clearance: YesNoNa | null
    h1b_sponsorship: YesNoNa | null
    job_url: string
    is_active: boolean
    raw_job_payload?: Json | null
    source_content_hash?: string | null
    ai_enrichment_status?: AiEnrichmentStatus | null
    ai_enrichment_model?: string | null
    ai_enriched_at?: string | null
    ai_enrichment_error?: string | null
    ai_enrichment_attempts?: number
    date_provenance?: 'source' | 'first_seen' | 'legacy_unknown'
    sourceDateProvenance?: 'source' | 'first_seen'
    source_field_provenance?: Record<string, string>
    structuredSourceFields?: StructuredSourceFields
    sourceHints?: Record<string, string>
}

export interface ExistingAiJobRecord {
    external_job_id: string | null
    posted_date: string | null
    source_content_hash: string | null
    ai_enrichment_status: AiEnrichmentStatus | null
    ai_enrichment_model: string | null
    ai_enriched_at: string | null
    ai_enrichment_error: string | null
    ai_enrichment_attempts: number | null
    title?: string | null
    location_type?: LocationType | null
    department?: string | null
    employment_type?: EmploymentType | null
    description?: string | null
    summary?: string | null
    required_qualifications?: string[] | null
    preferred_qualifications?: string[] | null
    pay_range?: string | null
    security_clearance?: YesNoNa | null
    h1b_sponsorship?: YesNoNa | null
}

export function createRawJobPayload(job: AiUpsertJob): Json {
    return {
        company_id: job.company_id,
        external_job_id: job.external_job_id,
        title: job.title,
        location: job.location,
        posted_date: job.posted_date || null,
        end_date: job.end_date || null,
        description: job.description,
        // Scraper-written summaries are often templates. Only a summary that
        // came from a dedicated source field is a source fact.
        summary: job.structuredSourceFields?.summary?.trim() || null,
        job_url: job.job_url,
        structured_source_fields: { ...(job.structuredSourceFields || {}) },
        source_hints: job.sourceHints || {},
    }
}

export function stableStringify(value: Json): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`

    const entries = Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue as Json)}`)

    return `{${entries.join(',')}}`
}

export function createSourceContentHash(payload: Json): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

export function prepareJobForAiUpsert(
    job: AiUpsertJob,
    existing?: ExistingAiJobRecord | null,
    options: { preservePostedDate?: boolean; firstSeenDate?: string } = {},
): AiUpsertJob {
    const { structuredSourceFields = {}, sourceHints = {}, sourceDateProvenance, ...sourceJob } = job
    const useFirstSeenDate = options.preservePostedDate || sourceDateProvenance === 'first_seen'
    const provenance = Object.fromEntries(Object.entries(structuredSourceFields)
        .filter(([, value]) => value != null && value !== '' && value !== 'N/A' && value !== 'Not specified' &&
            (!Array.isArray(value) || value.length > 0))
        .map(([key]) => [key, 'structured']))
    const prepared: AiUpsertJob = {
        ...sourceJob,
        location_type: structuredSourceFields.location_type || null,
        department: structuredSourceFields.department?.trim() || null,
        employment_type: structuredSourceFields.employment_type || null,
        summary: structuredSourceFields.summary?.trim() || null,
        required_qualifications: structuredSourceFields.required_qualifications || [],
        preferred_qualifications: structuredSourceFields.preferred_qualifications || [],
        pay_range: structuredSourceFields.pay_range && structuredSourceFields.pay_range !== 'Not specified'
            ? structuredSourceFields.pay_range : null,
        security_clearance: structuredSourceFields.security_clearance || null,
        h1b_sponsorship: structuredSourceFields.h1b_sponsorship || null,
        source_field_provenance: provenance,
        structuredSourceFields,
        sourceHints,
        posted_date: useFirstSeenDate
            ? existing?.posted_date || options.firstSeenDate || job.posted_date : job.posted_date,
        date_provenance: useFirstSeenDate ? 'first_seen' : 'source',
        is_active: true,
    }

    const today = new Date().toISOString().slice(0, 10)
    const cutoff = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)
    prepared.is_active = Boolean(prepared.posted_date && prepared.posted_date >= cutoff &&
        prepared.posted_date <= today && (!prepared.end_date || prepared.end_date >= today))

    const rawPayload = createRawJobPayload(prepared)
    const nextHash = createSourceContentHash(rawPayload)
    const hasSameSource = Boolean(existing?.source_content_hash && existing.source_content_hash === nextHash)

    prepared.raw_job_payload = rawPayload
    prepared.source_content_hash = nextHash
    delete prepared.structuredSourceFields
    delete prepared.sourceHints

    if (!hasSameSource) {
        prepared.ai_enrichment_status = 'pending'
        prepared.ai_enrichment_model = null
        prepared.ai_enriched_at = null
        prepared.ai_enrichment_error = null
        prepared.ai_enrichment_attempts = 0
        return prepared
    }

    prepared.ai_enrichment_status = existing?.ai_enrichment_status || 'pending'
    prepared.ai_enrichment_model = existing?.ai_enrichment_model || null
    prepared.ai_enriched_at = existing?.ai_enriched_at || null
    prepared.ai_enrichment_error = existing?.ai_enrichment_error || null
    prepared.ai_enrichment_attempts = existing?.ai_enrichment_attempts || 0

    // AI results live in jobs.ai_result and never overwrite source columns.
    return prepared
}

