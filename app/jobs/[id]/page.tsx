import { cache } from "react"
import { notFound } from "next/navigation"
import { getJobs, getJobById } from "@/lib/job-data"
import { JobDetailContent } from "@/components/job-detail-content"

export const revalidate = 300

const getJobsCached = cache(getJobs)
const getJobByIdCached = cache(getJobById)

export async function generateStaticParams() {
  const jobs = await getJobsCached()
  return jobs.map((job) => ({ id: job.id }))
}

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
