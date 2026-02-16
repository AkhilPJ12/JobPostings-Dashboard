import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function JobNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Search className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-foreground">Job not found</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        The job you are looking for may have been removed or is no longer
        available.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to all jobs
        </Link>
      </Button>
    </div>
  )
}
