import { supabase, type Json } from '@/lib/supabase'
import type { Job, ScraperStatus } from '@/lib/job-types'
import { JobSearchQuerySchema, type JobDetail, type JobFacets, type JobSearchQuery,
  type JobSummary, type PagedJobs } from './contracts'

type PublicRow = Record<string, any>

function nullable(value: unknown): string | null {
  return value == null || value === '' || value === 'N/A' || value === 'Not specified' ? null : String(value)
}

export function toJobSummary(row: PublicRow): JobSummary {
  return {
    id: String(row.id), externalJobId: row.external_job_id || '', title: row.title,
    company: row.company, companyColor: row.company_color || 'hsl(0, 0%, 20%)',
    companyIcon: row.company_icon || null, location: nullable(row.location),
    locationType: nullable(row.location_type) as JobSummary['locationType'],
    department: nullable(row.department), type: nullable(row.employment_type) as JobSummary['type'],
    postedDate: row.posted_date || null, firstSeenDate: row.first_seen_date || row.posted_date || '',
    dateProvenance: row.date_provenance || 'legacy_unknown', endDate: row.end_date || null,
    summary: nullable(row.summary), summaryGenerated: row.summary_generated === true,
    securityClearance: nullable(row.security_clearance) as JobSummary['securityClearance'],
    visaSponsorship: nullable(row.h1b_sponsorship) as JobSummary['visaSponsorship'],
    payRange: nullable(row.pay_range), jobUrl: row.job_url || '',
  }
}

export function toJobDetail(row: PublicRow): JobDetail {
  return { ...toJobSummary(row), description: row.description || '',
    requiredQualifications: row.required_qualifications || [],
    preferredQualifications: row.preferred_qualifications || [] }
}

export function toUiJob(row: PublicRow): Job {
  const known = (value: unknown) => value == null || value === 'N/A' || value === 'Not specified' || value === ''
    ? 'Unknown' : String(value)
  return {
    id: String(row.id), externalJobId: row.external_job_id || '', title: row.title,
    company: row.company, companyColor: row.company_color || 'hsl(0, 0%, 20%)',
    companyIcon: row.company_icon || null, location: known(row.location),
    locationType: known(row.location_type) as Job['locationType'],
    department: known(row.department), type: known(row.employment_type) as Job['type'],
    postedDate: row.posted_date || null, firstSeenDate: row.first_seen_date || null,
    dateProvenance: row.date_provenance || 'legacy_unknown', endDate: row.end_date || null,
    description: row.description || '', summary: row.summary || '',
    summaryGenerated: row.summary_generated === true,
    requiredQualifications: row.required_qualifications || [],
    preferredQualifications: row.preferred_qualifications || [],
    payRange: known(row.pay_range),
    securityClearance: known(row.security_clearance) as Job['securityClearance'],
    visaSponsorship: known(row.h1b_sponsorship) as Job['visaSponsorship'],
    jobUrl: row.job_url || '',
  }
}

export async function searchJobSummaries(input: Partial<JobSearchQuery> = {}): Promise<PagedJobs> {
  const query = JobSearchQuerySchema.parse(input)
  const { data, error } = await supabase.rpc('search_jobs', { p_query: query as unknown as Json })
  if (error) throw error
  const result = data as { jobs: PublicRow[]; total: number; page: number; pageSize: number }
  return { jobs: result.jobs.map(toJobSummary), total: result.total, page: result.page, pageSize: result.pageSize }
}

export async function searchJobs(input: Partial<JobSearchQuery> = {}) {
  const page = await searchJobSummaries(input)
  return { ...page, jobs: page.jobs.map(job => toUiJob({
    id: job.id, external_job_id: job.externalJobId, title: job.title, company: job.company,
    company_color: job.companyColor, company_icon: job.companyIcon, location: job.location,
    location_type: job.locationType, department: job.department, employment_type: job.type,
    posted_date: job.postedDate, first_seen_date: job.firstSeenDate, date_provenance: job.dateProvenance,
    end_date: job.endDate, summary: job.summary, summary_generated: job.summaryGenerated,
    security_clearance: job.securityClearance, h1b_sponsorship: job.visaSponsorship,
    pay_range: job.payRange, job_url: job.jobUrl,
  })) }
}

export async function getJobDetailRecord(id: string): Promise<JobDetail | undefined> {
  if (!/^\d+$/.test(id)) return undefined
  const { data, error } = await supabase.rpc('get_public_job', { p_id: Number(id) })
  if (error) throw error
  return data ? toJobDetail(data as PublicRow) : undefined
}

export async function getJobDetail(id: string): Promise<Job | undefined> {
  const job = await getJobDetailRecord(id)
  if (!job) return undefined
  return {
    ...job, location: job.location || 'Unknown', locationType: (job.locationType || 'Unknown') as Job['locationType'],
    department: job.department || 'Unknown', type: (job.type || 'Unknown') as Job['type'],
    summary: job.summary || '', payRange: job.payRange || 'Unknown',
    securityClearance: (job.securityClearance || 'Unknown') as Job['securityClearance'],
    visaSponsorship: (job.visaSponsorship || 'Unknown') as Job['visaSponsorship'],
  }
}

export async function getJobFacets(): Promise<JobFacets> {
  const { data, error } = await supabase.rpc('get_job_facets')
  if (error) throw error
  return data as unknown as JobFacets
}

export async function getPublicScraperStatuses(): Promise<ScraperStatus[]> {
  const { data, error } = await supabase.rpc('get_public_scraper_statuses')
  if (error) throw error
  return ((data || []) as PublicRow[]).map(row => ({
    companyName: row.company_name, companyIcon: row.company_icon || null,
    status: row.status, lastScrapedAt: row.completed_at ? new Date(row.completed_at) : null,
    durationSeconds: row.duration_seconds, errorMessage: null, totalJobs: row.total_jobs || 0,
  }))
}

export interface EnrichmentHealth {
  pending: number
  failed: number
  oldestPendingAt: string | null
  attempts: number
  validationFailures: number
  averageLatencyMs: number | null
  inputTokens: number
  outputTokens: number
}

export async function getEnrichmentHealth(): Promise<EnrichmentHealth> {
  const { data, error } = await supabase.rpc('get_public_enrichment_health')
  if (error) throw error
  return data as unknown as EnrichmentHealth
}
