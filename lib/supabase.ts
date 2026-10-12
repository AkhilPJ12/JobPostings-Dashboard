import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

// Compatibility types until Supabase CLI types can be generated from the migrated project.
// The original companies/jobs DDL is not checked in, so this is not an authoritative schema dump.
export type Database = {
    public: {
        Tables: {
            companies: {
                Row: {
                    id: number
                    name: string
                    logo_url: string | null
                    Company_icon: string | null
                    website_url: string | null
                    careers_url: string | null
                    careers_url_1: string | null

                    color: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    name: string
                    logo_url?: string | null
                    Company_icon?: string | null
                    website_url?: string | null
                    careers_url?: string | null
                    careers_url_1?: string | null
                    color?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    name?: string
                    logo_url?: string | null
                    Company_icon?: string | null
                    website_url?: string | null
                    careers_url?: string | null
                    careers_url_1?: string | null
                    color?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            jobs: {
                Row: {
                    id: number
                    company_id: number
                    external_job_id: string | null
                    title: string
                    location: string | null
                    location_type: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department: string | null
                    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date: string | null
                    end_date: string | null
                    description: string | null
                    summary: string | null
                    required_qualifications: string[] | null
                    preferred_qualifications: string[] | null
                    pay_range: string | null
                    security_clearance: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship: 'Yes' | 'No' | 'N/A' | null
                    job_url: string | null
                    raw_job_payload: Json | null
                    source_content_hash: string | null
                    source_field_provenance: Json
                    search_text: string
                    first_seen_at: string
                    last_seen_at: string
                    date_provenance: 'source' | 'first_seen' | 'legacy_unknown'
                    ai_result: Json | null
                    ai_result_source_hash: string | null
                    ai_prompt_version: number | null
                    ai_enrichment_status: 'pending' | 'enriched' | 'failed' | null
                    ai_enrichment_model: string | null
                    ai_enriched_at: string | null
                    ai_enrichment_error: string | null
                    ai_enrichment_attempts: number
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: number
                    company_id: number
                    external_job_id?: string | null
                    title: string
                    location?: string | null
                    location_type?: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department?: string | null
                    employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date?: string | null
                    end_date?: string | null
                    description?: string | null
                    summary?: string | null
                    required_qualifications?: string[] | null
                    preferred_qualifications?: string[] | null
                    pay_range?: string | null
                    security_clearance?: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship?: 'Yes' | 'No' | 'N/A' | null
                    job_url?: string | null
                    raw_job_payload?: Json | null
                    source_content_hash?: string | null
                    source_field_provenance?: Json
                    first_seen_at?: string
                    last_seen_at?: string
                    date_provenance?: 'source' | 'first_seen' | 'legacy_unknown'
                    ai_result?: Json | null
                    ai_result_source_hash?: string | null
                    ai_prompt_version?: number | null
                    ai_enrichment_status?: 'pending' | 'enriched' | 'failed' | null
                    ai_enrichment_model?: string | null
                    ai_enriched_at?: string | null
                    ai_enrichment_error?: string | null
                    ai_enrichment_attempts?: number
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: number
                    company_id?: number
                    external_job_id?: string | null
                    title?: string
                    location?: string | null
                    location_type?: 'Remote' | 'Hybrid' | 'Onsite' | null
                    department?: string | null
                    employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
                    posted_date?: string | null
                    end_date?: string | null
                    description?: string | null
                    summary?: string | null
                    required_qualifications?: string[] | null
                    preferred_qualifications?: string[] | null
                    pay_range?: string | null
                    security_clearance?: 'Yes' | 'No' | 'N/A' | null
                    h1b_sponsorship?: 'Yes' | 'No' | 'N/A' | null
                    job_url?: string | null
                    raw_job_payload?: Json | null
                    source_content_hash?: string | null
                    source_field_provenance?: Json
                    first_seen_at?: string
                    last_seen_at?: string
                    date_provenance?: 'source' | 'first_seen' | 'legacy_unknown'
                    ai_result?: Json | null
                    ai_result_source_hash?: string | null
                    ai_prompt_version?: number | null
                    ai_enrichment_status?: 'pending' | 'enriched' | 'failed' | null
                    ai_enrichment_model?: string | null
                    ai_enriched_at?: string | null
                    ai_enrichment_error?: string | null
                    ai_enrichment_attempts?: number
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: 'jobs_company_id_fkey'
                        columns: ['company_id']
                        isOneToOne: false
                        referencedRelation: 'companies'
                        referencedColumns: ['id']
                    },
                ]
            }
            ai_enrichment_usage: {
                Row: {
                    usage_date: string
                    model: string
                    request_count: number
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    usage_date: string
                    model: string
                    request_count?: number
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    usage_date?: string
                    model?: string
                    request_count?: number
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            ai_enrichment_queue: {
                Row: { id: number; job_id: number; source_hash: string; model: string; prompt_version: number; state: 'pending' | 'leased' | 'done' | 'failed'; attempts: number; available_at: string; lease_token: string | null; leased_until: string | null; last_error: string | null; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; created_at: string; updated_at: string }
                Insert: { job_id: number; source_hash: string; model: string; prompt_version: number; state?: 'pending' | 'leased' | 'done' | 'failed' }
                Update: { state?: 'pending' | 'leased' | 'done' | 'failed'; attempts?: number; available_at?: string }
                Relationships: []
            }
            scraper_runs: {
                Row: {
                    id: number
                    company_name: string
                    run_group_id: string | null
                    status: 'Successful' | 'Error' | 'Partial'
                    started_at: string
                    completed_at: string | null
                    duration_seconds: number | null
                    error_message: string | null
                    created_at: string
                }
                Insert: {
                    id?: number
                    company_name: string
                    run_group_id?: string | null
                    status: 'Successful' | 'Error' | 'Partial'
                    started_at: string
                    completed_at?: string | null
                    duration_seconds?: number | null
                    error_message?: string | null
                    created_at?: string
                }
                Update: {
                    id?: number
                    company_name?: string
                    run_group_id?: string | null
                    status?: 'Successful' | 'Error' | 'Partial'
                    started_at?: string
                    completed_at?: string | null
                    duration_seconds?: number | null
                    error_message?: string | null
                    created_at?: string
                }
                Relationships: []
            }
        }
        Views: Record<string, never>
        Functions: {
            claim_scraper_lease: { Args: { p_company: string; p_seconds?: number }; Returns: string | null }
            finish_scraper_lease: { Args: { p_company: string; p_token: string; p_run_group: string; p_status: string; p_started_at: string; p_completed_at: string; p_error: string | null }; Returns: boolean }
            search_jobs: { Args: { p_query?: Json }; Returns: Json }
            get_public_job: { Args: { p_id: number }; Returns: Json }
            get_job_facets: { Args: Record<string, never>; Returns: Json }
            get_public_scraper_statuses: { Args: Record<string, never>; Returns: Json }
            get_public_enrichment_health: { Args: Record<string, never>; Returns: Json }
            claim_ai_enrichment: { Args: { p_model: string; p_lease_seconds?: number; p_company?: string | null; p_state?: string }; Returns: Json }
            claim_ai_worker_lease: { Args: Record<string, never>; Returns: string | null }
            renew_ai_worker_lease: { Args: { p_token: string }; Returns: boolean }
            release_ai_worker_lease: { Args: { p_token: string }; Returns: boolean }
            count_ai_enrichment_queue: { Args: { p_model: string; p_state?: string; p_company?: string | null }; Returns: number }
            finish_ai_enrichment: { Args: { p_queue_id: number; p_lease_token: string; p_result: Json; p_latency_ms: number; p_input_tokens: number | null; p_output_tokens: number | null }; Returns: boolean }
            fail_ai_enrichment: { Args: { p_queue_id: number; p_lease_token: string; p_error: string; p_retryable: boolean; p_retry_after_seconds?: number | null }; Returns: boolean }
            release_ai_enrichment: { Args: { p_queue_id: number; p_lease_token: string; p_delay_seconds?: number }; Returns: boolean }
            consume_ai_enrichment_quota: {
                Args: {
                    p_usage_date: string
                    p_model: string
                    p_max_requests: number
                }
                Returns: boolean
            }
        }
        Enums: Record<string, never>
        CompositeTypes: Record<string, never>
    }
}

let supabaseClient: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
    if (supabaseClient) return supabaseClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        )
    }

    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey)
    return supabaseClient
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
    get(_target, prop) {
        const client = getSupabaseClient()
        const value = (client as any)[prop]
        return typeof value === 'function' ? value.bind(client) : value
    },
})
