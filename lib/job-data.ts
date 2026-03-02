import { supabase } from './supabase'

// Re-export the Job type for compatibility
export type Job = {
    id: string
    title: string
    company: string
    companyColor: string
    location: string
    locationType: "Remote" | "Hybrid" | "Onsite"
    department: string
    type: "Full-time" | "Part-time" | "Contract" | "Internship"
    postedDate: Date
    description: string
    securityClearance: "Yes" | "No" | "N/A"
    h1bSponsorship: "Yes" | "No" | "N/A"
    summary: string
    requiredQualifications: string[]
    preferredQualifications: string[]
    payRange: string
}

export type ScraperRunStatus = "Successful" | "Error" | "Partial"

export type ScraperStatus = {
    companyName: string
    status: ScraperRunStatus | "Not Run"
    lastScrapedAt: Date | null
    durationSeconds: number | null
    errorMessage: string | null
}

/**
 * Fetch all active jobs from the database with company information
 */
export async function getJobs(): Promise<Job[]> {
    console.log('🔍 getJobs: Starting to fetch jobs from database...')

    // Supabase enforces a server-side max of 1000 rows per request.
    // Paginate to fetch all jobs.
    const PAGE_SIZE = 1000
    let allData: any[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
        const { data, error } = await supabase
            .from('jobs')
            .select(`
          *,
          company:companies(*)
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
            // If we got fewer than PAGE_SIZE, we've reached the end
            hasMore = data.length === PAGE_SIZE
        } else {
            hasMore = false
        }
    }

    console.log('🔍 getJobs: Raw response total:', allData.length)

    // Transform database format to frontend format
    const jobs = allData.map(job => ({
        id: job.id.toString(),
        title: job.title,
        company: job.company.name,
        companyColor: job.company.color || 'hsl(0, 0%, 20%)',
        location: job.location || 'Not specified',
        locationType: job.location_type || 'Onsite',
        department: job.department || 'General',
        type: job.employment_type || 'Full-time',
        postedDate: job.posted_date ? new Date(job.posted_date) : new Date(),
        description: job.description || '',
        securityClearance: job.security_clearance || 'N/A',
        h1bSponsorship: job.h1b_sponsorship || 'N/A',
        summary: job.summary || '',
        requiredQualifications: job.required_qualifications || [],
        preferredQualifications: job.preferred_qualifications || [],
        payRange: job.pay_range || 'Not specified',
    }))

    console.log('✅ getJobs: Transformed jobs:', jobs.length, 'jobs')
    return jobs
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
        title: data.title,
        company: data.company.name,
        companyColor: data.company.color || 'hsl(0, 0%, 20%)',
        location: data.location || 'Not specified',
        locationType: data.location_type || 'Onsite',
        department: data.department || 'General',
        type: data.employment_type || 'Full-time',
        postedDate: data.posted_date ? new Date(data.posted_date) : new Date(),
        description: data.description || '',
        securityClearance: data.security_clearance || 'N/A',
        h1bSponsorship: data.h1b_sponsorship || 'N/A',
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
 * Format relative date (e.g., "2 days ago", "Today")
 */
export function formatRelativeDate(date: Date): string {
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
}

/**
 * Get latest scraper status for each active company.
 */
export async function getScraperStatuses(): Promise<ScraperStatus[]> {
    const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('name')
        .eq('is_active', true)
        .order('name')

    if (companyError) {
        console.error('Error fetching companies for scraper status:', companyError)
        return []
    }

    const companyNames = (companies || []).map(c => c.name)
    if (companyNames.length === 0) return []

    const { data: runs, error: runsError } = await supabase
        .from('scraper_runs')
        .select('company_name, status, completed_at, duration_seconds, error_message')
        .in('company_name', companyNames)
        .order('completed_at', { ascending: false })

    if (runsError) {
        // Gracefully handle missing table / permission while UI is already deployed.
        console.error('Error fetching scraper runs:', runsError)
        return companyNames.map((name) => ({
            companyName: name,
            status: "Not Run",
            lastScrapedAt: null,
            durationSeconds: null,
            errorMessage: null,
        }))
    }

    const latestByCompany = new Map<string, {
        status: ScraperRunStatus
        completed_at: string | null
        duration_seconds: number | null
        error_message: string | null
    }>()

    for (const run of runs || []) {
        if (!latestByCompany.has(run.company_name)) {
            latestByCompany.set(run.company_name, run)
        }
    }

    return companyNames.map((name) => {
        const latest = latestByCompany.get(name)
        return {
            companyName: name,
            status: latest?.status || "Not Run",
            lastScrapedAt: latest?.completed_at ? new Date(latest.completed_at) : null,
            durationSeconds: latest?.duration_seconds ?? null,
            errorMessage: latest?.error_message ?? null,
        }
    })
}
