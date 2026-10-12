import { JobCardSkeleton } from '@/components/job-card'

export default function Loading() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 lg:px-6" role="status" aria-label="Loading jobs">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => <JobCardSkeleton key={index} />)}
      </div>
    </main>
  )
}
