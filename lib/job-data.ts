/** Compatibility exports for existing detail and status consumers. */
import { formatDate, type Job, type ScraperRunStatus, type ScraperStatus } from './job-types'
import { getJobDetail, getPublicScraperStatuses } from './modules/jobs/repository'

export { formatDate }
export type { Job, ScraperRunStatus, ScraperStatus }

export const getJobById = getJobDetail
export const getScraperStatuses = getPublicScraperStatuses
