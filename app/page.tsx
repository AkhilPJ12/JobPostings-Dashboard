import { JobDashboard } from "@/components/job-dashboard"
import { getJobFacets, searchJobs } from '@/lib/modules/jobs/repository'
import { parseSearchParams } from '@/lib/modules/jobs/contracts'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
const getCachedFacets = unstable_cache(getJobFacets, ['global-job-facets'], { revalidate: 300 })

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item))
    else if (value) params.set(key, value)
  }
  const query = parseSearchParams(params)
  const [paged, facets] = await Promise.all([searchJobs(query), getCachedFacets()])

  return (
    <JobDashboard
      key={params.toString()}
      initialJobs={paged.jobs}
      initialCompanyCount={facets.companies.length}
      initialPagedJobs={paged}
      initialQuery={query}
      initialFacets={facets}
    />
  )
}
