"use client"

import Link from "next/link"
import { MapPin, Building2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type Job } from "@/lib/job-data"
import { cn } from "@/lib/utils"

function StatusBadge({ label, value }: { label: string; value: "Yes" | "No" | "N/A" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}:</span>
      <Badge
        variant="outline"
        className={cn(
          "h-5 px-1.5 text-[11px] font-medium",
          value === "Yes" && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
          value === "No" && "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400",
          value === "N/A" && "border-border bg-muted text-muted-foreground"
        )}
      >
        {value}
      </Badge>
    </span>
  )
}

export function JobCard({ job }: { job: Job }) {
  return (
    <article
      className={cn(
        "group relative rounded-lg border border-border bg-card px-4 py-3 transition-all duration-200",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Company initial */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
          style={{
            backgroundColor: job.companyColor,
            color: "white",
          }}
          aria-hidden="true"
        >
          {job.company.charAt(0)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Row 1: Title */}
          <h3 className="text-sm font-semibold leading-tight text-card-foreground group-hover:text-primary transition-colors">
            {job.title}
          </h3>

          {/* Row 2: Company + Location */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              {job.company}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {job.location}
              {job.locationType !== "Onsite" && job.location !== "Remote" && (
                <span className="text-muted-foreground/70">
                  {"("}{job.locationType}{")"}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right side: badges */}
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <StatusBadge label="Clearance" value={job.securityClearance} />
          <StatusBadge label="H1B" value={job.h1bSponsorship} />
        </div>
      </div>

      {/* Mobile badges */}
      <div className="mt-2 flex items-center gap-3 pl-12 sm:hidden">
        <StatusBadge label="Clearance" value={job.securityClearance} />
        <StatusBadge label="H1B" value={job.h1bSponsorship} />
      </div>

      <Link
        href={`/jobs/${job.id}`}
        className="absolute inset-0 rounded-lg"
        aria-label={`View details for ${job.title} at ${job.company}`}
      >
        <span className="sr-only">View Details</span>
      </Link>
    </article>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
          <div className="mt-1.5 flex gap-3">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
