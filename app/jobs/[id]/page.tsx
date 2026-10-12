import { cache } from "react"
import { notFound } from "next/navigation"
import { getJobDetail } from "@/lib/modules/jobs/repository"
import { JobDetailContent } from "@/components/job-detail-content"

// Resolve details on demand so expired postings and source updates are reflected promptly.
export const revalidate = 0
export const dynamicParams = true

const getJobByIdCached = cache(getJobDetail)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = await getJobByIdCached(id)

  if (!job) {
    return { title: "Job Not Found" }
  }

  return {
    title: `${job.title} at ${job.company} - Job Dashboard`,
    description: job.summary,
  }
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = await getJobByIdCached(id)

  if (!job) {
    notFound()
  }

  return <JobDetailContent job={job} />
}
