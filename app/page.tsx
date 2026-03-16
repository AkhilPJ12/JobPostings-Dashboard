import { getJobs, getUniqueCompanyCount, getScraperStatuses } from "@/lib/job-data"
import { JobDashboard } from "@/components/job-dashboard"

export const revalidate = 300

export default async function Page() {
  const [jobs, companyCount, scraperStatuses] = await Promise.all([
    getJobs(),
    getUniqueCompanyCount(),
    getScraperStatuses(),
  ])

  return (
    <JobDashboard
      initialJobs={jobs}
      initialCompanyCount={companyCount}
      initialScraperStatuses={scraperStatuses}
    />
  )
}
