import { z } from 'zod'

export const JobSearchQuerySchema = z.object({
  q: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['recent', 'company', 'title']).default('recent'),
  companies: z.array(z.string().max(100)).max(50).default([]),
  locationTypes: z.array(z.string().max(100)).max(50).default([]),
  departments: z.array(z.string().max(100)).max(50).default([]),
  employmentTypes: z.array(z.string().max(100)).max(50).default([]),
  visaSponsorship: z.array(z.string().max(100)).max(50).default([]),
  securityClearance: z.array(z.string().max(100)).max(50).default([]),
  datePosted: z.enum(['all', 'today', '7days', '14days']).default('all'),
})

export type JobSearchQuery = z.infer<typeof JobSearchQuerySchema>
export type DateProvenance = 'source' | 'first_seen' | 'legacy_unknown'

export interface JobSummary {
  id: string
  externalJobId: string
  title: string
  company: string
  companyColor: string
  companyIcon: string | null
  location: string | null
  locationType: 'Remote' | 'Hybrid' | 'Onsite' | null
  department: string | null
  type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | null
  postedDate: string | null
  firstSeenDate: string
  dateProvenance: DateProvenance
  endDate: string | null
  summary: string | null
  summaryGenerated: boolean
  securityClearance: 'Yes' | 'No' | null
  visaSponsorship: 'Yes' | 'No' | null
  payRange: string | null
  jobUrl: string
}

export interface JobDetail extends JobSummary {
  description: string
  requiredQualifications: string[]
  preferredQualifications: string[]
}

export interface PagedJobs {
  jobs: JobSummary[]
  total: number
  page: number
  pageSize: number
}

export interface JobFacets {
  companies: Array<{ value: string; count: number }>
  departments: Array<{ value: string; count: number }>
  employmentTypes: Array<{ value: string; count: number }>
  visaSponsorship: Array<{ value: string; count: number }>
  securityClearance: Array<{ value: string; count: number }>
}

export function parseSearchParams(params: URLSearchParams): JobSearchQuery {
  const list = (name: string) => params.getAll(name).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean)
  const parsed = JobSearchQuerySchema.safeParse({
    q: params.get('q') || '',
    page: params.get('page') || 1,
    pageSize: params.get('pageSize') || 20,
    sort: params.get('sort') || 'recent',
    companies: list('company'),
    locationTypes: list('locationType'),
    departments: list('department'),
    employmentTypes: list('employmentType'),
    visaSponsorship: list('visa'),
    securityClearance: list('clearance'),
    datePosted: params.get('date') || 'all',
  })
  return parsed.success ? parsed.data : JobSearchQuerySchema.parse({})
}

export function toSearchParams(query: JobSearchQuery): URLSearchParams {
  const result = new URLSearchParams()
  if (query.q) result.set('q', query.q)
  if (query.page !== 1) result.set('page', String(query.page))
  if (query.pageSize !== 20) result.set('pageSize', String(query.pageSize))
  if (query.sort !== 'recent') result.set('sort', query.sort)
  if (query.datePosted !== 'all') result.set('date', query.datePosted)
  const lists: Array<[string, string[]]> = [
    ['company', query.companies], ['locationType', query.locationTypes], ['department', query.departments],
    ['employmentType', query.employmentTypes], ['visa', query.visaSponsorship], ['clearance', query.securityClearance],
  ]
  for (const [key, values] of lists) for (const value of values) result.append(key, value)
  return result
}
