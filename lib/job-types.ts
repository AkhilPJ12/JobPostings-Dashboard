export type Job = {
    id: string
    externalJobId: string
    title: string
    company: string
    companyColor: string
    companyIcon: string | null
    location: string
    locationType: "Remote" | "Hybrid" | "Onsite" | "Unknown"
    department: string
    type: "Full-time" | "Part-time" | "Contract" | "Internship" | "Unknown"
    postedDate: string | null
    endDate: string | null
    description: string
    securityClearance: "Yes" | "No" | "N/A" | "Unknown"
    visaSponsorship: "Yes" | "No" | "N/A" | "Unknown"
    jobUrl: string
    summary: string
    requiredQualifications: string[]
    preferredQualifications: string[]
    payRange: string
    firstSeenDate?: string | null
    dateProvenance?: 'source' | 'first_seen' | 'legacy_unknown'
    summaryGenerated?: boolean
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
