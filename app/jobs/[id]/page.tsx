import { cache } from "react"
import { notFound } from "next/navigation"
import { getJobById } from "@/lib/job-data"
import { JobDetailContent } from "@/components/job-detail-content"

// Generate pages on-demand (ISR) — no pre-building 7000+ pages at deploy time.
// Each page is built on first visit and cached for 5 minutes.
export const revalidate = 300
export const dynamicParams = true

const getJobByIdCached = cache(getJobById)

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
