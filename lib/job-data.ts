import { supabase } from './supabase'

// Re-export the Job type for compatibility
export type Job = {
    id: string
    externalJobId: string
    title: string
    company: string
    companyColor: string
    companyIcon: string | null
    location: string
    locationType: "Remote" | "Hybrid" | "Onsite"
    department: string
    type: "Full-time" | "Part-time" | "Contract" | "Internship"
    postedDate: string | null
    endDate: string | null
    description: string
    securityClearance: "Yes" | "No" | "N/A"
    visaSponsorship: "Yes" | "No" | "N/A"
    jobUrl: string
    summary: string
    requiredQualifications: string[]
    preferredQualifications: string[]
    payRange: string
}

export type ScraperRunStatus = "Successful" | "Error" | "Partial"

export type ScraperStatus = {
    companyName: string
    companyIcon: string | null
    status: ScraperRunStatus | "Not Run"
    lastScrapedAt: Date | null
    durationSeconds: number | null
    errorMessage: string | null
    totalJobs: number
}

const JOBS_CACHE_TTL_MS = 5 * 60 * 1000
let jobsCache: { expiresAt: number; data: Job[] } | null = null
let jobsInFlight: Promise<Job[]> | null = null

/**
 * Fetch all active jobs from the database with company information
 */
export async function getJobs(): Promise<Job[]> {
    const nowTs = Date.now()
    if (jobsCache && jobsCache.expiresAt > nowTs) {
        return jobsCache.data
    }
    if (jobsInFlight) {
        return jobsInFlight
    }

    console.log('🔍 getJobs: Starting to fetch jobs from database...')

    // Supabase enforces a server-side max of 1000 rows per request.
    // Paginate to fetch all jobs.
    const PAGE_SIZE = 1000
    let allData: any[] = []
    let from = 0
    let hasMore = true
    jobsInFlight = (async () => {
        while (hasMore) {
            const { data, error } = await supabase
                .from('jobs')
                .select(`
          id,
          external_job_id,
          title,
          location,
          location_type,
          department,
          employment_type,
          posted_date,
          end_date,
          summary,
          security_clearance,
          h1b_sponsorship,
          pay_range,
          job_url,
          company:companies(name,color,Company_icon)
        `)
                .eq('is_active', true)
                .order('posted_date', { ascending: false })
                .range(from, from + PAGE_SIZE - 1)

            if (error) {
                console.error('❌ Error fetching jobs:', error)
                throw error
            }

            if (data && data.length > 0) {
                allData = allData.concat(data)
                from += PAGE_SIZE
                hasMore = data.length === PAGE_SIZE
            } else {
                hasMore = false
            }
        }

        const jobs = allData.map(job => ({
            id: job.id.toString(),
            externalJobId: job.external_job_id || '',
            title: job.title,
            company: job.company.name,
            companyColor: job.company.color || 'hsl(0, 0%, 20%)',
            companyIcon: job.company.Company_icon || null,
            location: job.location || 'Not specified',
            locationType: job.location_type || 'Onsite',
            department: job.department || 'General',
            type: job.employment_type || 'Full-time',
            postedDate: job.posted_date || null,
            endDate: job.end_date ?? null,
            // Dashboard does not need full description payload; summary is enough for list/search snippets.
            description: job.summary || '',
            securityClearance: job.security_clearance || 'N/A',
            visaSponsorship: job.h1b_sponsorship || 'N/A',
            jobUrl: job.job_url || '',
            summary: job.summary || '',
            requiredQualifications: [],
            preferredQualifications: [],
            payRange: job.pay_range || 'Not specified',
        }))

        jobsCache = { data: jobs, expiresAt: Date.now() + JOBS_CACHE_TTL_MS }
        console.log('✅ getJobs: Transformed jobs:', jobs.length, 'jobs')
        return jobs
    })()

    try {
        return await jobsInFlight
    } finally {
        jobsInFlight = null
    }
}

/**
 * Get a single job by ID
 */
export async function getJobById(id: string): Promise<Job | undefined> {
    const { data, error } = await supabase
        .from('jobs')
        .select(`
      *,
      company:companies(*)
    `)
        .eq('id', parseInt(id))
        .eq('is_active', true)
        .single()

    if (error) {
        console.error('Error fetching job:', error)
        return undefined
    }

    if (!data) return undefined

    return {
        id: data.id.toString(),
        externalJobId: data.external_job_id || '',
        title: data.title,
        company: data.company.name,
        companyColor: data.company.color || 'hsl(0, 0%, 20%)',
        companyIcon: data.company.Company_icon || null,
        location: data.location || 'Not specified',
        locationType: data.location_type || 'Onsite',
        department: data.department || 'General',
        type: data.employment_type || 'Full-time',
        postedDate: data.posted_date || null,
        endDate: data.end_date ?? null,
        description: data.description || '',
        securityClearance: data.security_clearance || 'N/A',
        visaSponsorship: data.h1b_sponsorship || 'N/A',
        jobUrl: data.job_url || '',
        summary: data.summary || '',
        requiredQualifications: data.required_qualifications || [],
        preferredQualifications: data.preferred_qualifications || [],
        payRange: data.pay_range || 'Not specified',
    }
}

/**
 * Get unique companies from the database
 */
export async function getUniqueCompanies(): Promise<string[]> {
    const { data, error } = await supabase
        .from('companies')
        .select('name')
        .eq('is_active', true)
        .order('name')

    if (error) {
        console.error('Error fetching companies:', error)
        return []
    }

    return (data || []).map(c => c.name)
}

/**
 * Get unique departments from jobs
 */
export async function getUniqueDepartments(): Promise<string[]> {
    const { data, error } = await supabase
        .from('jobs')
        .select('department')
        .eq('is_active', true)
        .not('department', 'is', null)

    if (error) {
        console.error('Error fetching departments:', error)
        return []
    }

    // Get unique departments
    const departments = [...new Set((data || []).map(j => j.department).filter(Boolean))]
    return departments.sort()
}

/**
 * Get unique location types
 */
export function getUniqueLocationTypes(): string[] {
    return ['Remote', 'Hybrid', 'Onsite']
}

/**
 * Get count of jobs by company
 */
export async function getJobCountByCompany(companyName: string): Promise<number> {
    const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('name', companyName)
        .single()

    if (companyError || !company) return 0

    const { count, error } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('is_active', true)

    if (error) return 0
    return count || 0
}

/**
 * Get count of unique companies
 */
export async function getUniqueCompanyCount(): Promise<number> {
    const { count, error } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

    if (error) return 0
    return count || 0
}

/**
 * Format a date string (e.g., "2026-03-12") into a readable format (e.g., "Mar 12, 2026").
 * Returns "N/A" if the date is null or invalid.
 */
export function formatDate(dateStr: string | null): string {
    if (!dateStr) return "N/A"
    const date = new Date(dateStr + 'T00:00:00')
    if (isNaN(date.getTime())) return "N/A"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Get latest scraper status for each active company.
 */
export async function getScraperStatuses(): Promise<ScraperStatus[]> {
    const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id, name, Company_icon')
        .eq('is_active', true)
        .order('name')

    if (companyError) {
        console.error('Error fetching companies for scraper status:', companyError)
        return []
    }

    const companyNames = (companies || []).map(c => c.name)
    const companyIconMap = new Map((companies || []).map(c => [c.name, c.Company_icon as string | null]))
    const companyIdMap = new Map((companies || []).map(c => [c.name, c.id as number]))
    if (companyNames.length === 0) return []

    // Fetch job counts per company (proper async/await — avoids PromiseLike quirks)
    // and scraper runs in parallel
    const countJobsForCompany = async (companyId: number): Promise<number> => {
        const { count, error } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('is_active', true)
        if (error) console.error(`Error counting jobs for company ${companyId}:`, error)
        return count ?? 0
    }

    const [runsResult, ...jobCounts] = await Promise.all([
        supabase
            .from('scraper_runs')
            .select('company_name, status, completed_at, duration_seconds, error_message')
            .in('company_name', companyNames)
            .order('completed_at', { ascending: false }),
        ...(companies || []).map(c => countJobsForCompany(c.id)),
    ])

    const jobCountById = new Map<number, number>(
        (companies || []).map((c, i) => [c.id, jobCounts[i] as number])
    )

    if ((runsResult as { error: unknown }).error) {
        // Gracefully handle missing table / permission while UI is already deployed.
        console.error('Error fetching scraper runs:', (runsResult as { error: unknown }).error)
        return companyNames.map((name) => ({
            companyName: name,
            companyIcon: companyIconMap.get(name) ?? null,
            status: "Not Run",
            lastScrapedAt: null,
            durationSeconds: null,
            errorMessage: null,
            totalJobs: jobCountById.get(companyIdMap.get(name)!) ?? 0,
        }))
    }

    const runsData = runsResult as { data: Array<{company_name: string; status: ScraperRunStatus; completed_at: string | null; duration_seconds: number | null; error_message: string | null}> | null }

    const latestByCompany = new Map<string, {
        status: ScraperRunStatus
        completed_at: string | null
        duration_seconds: number | null
        error_message: string | null
    }>()

    for (const run of runsData.data || []) {
        if (!latestByCompany.has(run.company_name)) {
            latestByCompany.set(run.company_name, run)
        }
    }

    return companyNames.map((name) => {
        const latest = latestByCompany.get(name)
        const companyId = companyIdMap.get(name)
        return {
            companyName: name,
            companyIcon: companyIconMap.get(name) ?? null,
            status: latest?.status || "Not Run",
            lastScrapedAt: latest?.completed_at ? new Date(latest.completed_at) : null,
            durationSeconds: latest?.duration_seconds ?? null,
            errorMessage: latest?.error_message ?? null,
            totalJobs: companyId !== undefined ? (jobCountById.get(companyId) ?? 0) : 0,
        }
    })
}
