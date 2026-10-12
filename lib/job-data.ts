/** Compatibility exports for scripts and live smoke tests. The app uses the paged repository directly. */
import { formatDate, type Job, type ScraperRunStatus, type ScraperStatus } from './job-types'
import { getJobDetail, getJobFacets, getPublicScraperStatuses, searchJobs } from './modules/jobs/repository'

export { formatDate }
export type { Job, ScraperRunStatus, ScraperStatus }

export async function getJobs(): Promise<Job[]> {
  const first = await searchJobs({ page: 1, pageSize: 100 })
  const jobs = [...first.jobs]
  for (let page = 2; page <= Math.ceil(first.total / 100); page++) {
    jobs.push(...(await searchJobs({ page, pageSize: 100 })).jobs)
  }
  return jobs
}

export const getJobById = getJobDetail
export const getScraperStatuses = getPublicScraperStatuses
export async function getUniqueCompanies(): Promise<string[]> {
  return (await getJobFacets()).companies.map(item => item.value)
}
export async function getUniqueDepartments(): Promise<string[]> {
  return (await getJobFacets()).departments.map(item => item.value)
}
export function getUniqueLocationTypes(): string[] { return ['Remote', 'Hybrid', 'Onsite', 'Unknown'] }
export async function getJobCountByCompany(companyName: string): Promise<number> {
  return (await getJobFacets()).companies.find(item => item.value === companyName)?.count || 0
}
export async function getUniqueCompanyCount(): Promise<number> {
  return (await getJobFacets()).companies.length
}
