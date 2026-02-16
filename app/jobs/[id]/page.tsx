import { notFound } from "next/navigation"
import { jobs, getJobById } from "@/lib/job-data"
import { JobDetailContent } from "@/components/job-detail-content"

export async function generateStaticParams() {
  return jobs.map((job) => ({ id: job.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = getJobById(id)

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
  const job = getJobById(id)

  if (!job) {
    notFound()
  }

  return <JobDetailContent job={job} />
}
