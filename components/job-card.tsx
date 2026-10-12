"use client"

import Link from "next/link"
import Image from "next/image"
import type { ReactNode } from "react"
import {
  ArrowUpRight,
  Calendar,
  DollarSign,
  ExternalLink,
  Globe2,
  MapPin,
  ShieldCheck,
} from "lucide-react"
import { type Job, formatDate } from "@/lib/job-types"
import { cn } from "@/lib/utils"

const workTypeBadge: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  Unknown: { bg: 'bg-muted/40', text: 'text-muted-foreground', dot: 'bg-muted-foreground', border: 'border-border' },
  Remote: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
  },
  Hybrid: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    text: "text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
    border: "border-sky-200/60 dark:border-sky-800/40",
  },
  Onsite: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-200/60 dark:border-amber-800/40",
  },
}

const employmentBadge: Record<string, string> = {
  "Full-time": "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-200/60 dark:border-violet-800/40",
  "Part-time": "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/40",
  Contract: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200/60 dark:border-orange-800/40",
  Internship: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border-pink-200/60 dark:border-pink-800/40",
}

function CompanyMark({ job, size = "md" }: { job: Job; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-9 w-9" : "h-10 w-10"

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/70", dimension)}>
      {job.companyIcon ? (
        <Image
          src={job.companyIcon}
          alt={job.company}
          fill
          className="object-contain bg-white p-1.5 dark:bg-white/90"
          sizes={size === "sm" ? "36px" : "40px"}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: job.companyColor }}
        >
          {job.company.charAt(0)}
        </div>
      )}
    </div>
  )
}

function BadgePill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold", className)}>
      {children}
    </span>
  )
}

function WorkTypePill({ type }: { type: Job["locationType"] }) {
  const wt = workTypeBadge[type] ?? workTypeBadge.Unknown
  return (
    <BadgePill className={cn(wt.bg, wt.text, wt.border)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", wt.dot)} />
      {type}
    </BadgePill>
  )
}

function JobSignals({ job, compact = false }: { job: Job; compact?: boolean }) {
  const pay = job.payRange && job.payRange !== "Not specified" ? job.payRange : null
  const positiveVisa = job.visaSponsorship === "Yes"
  const clearance = job.securityClearance === "Yes"

  return (
    <div className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {pay && (
        <BadgePill className="border-border/70 bg-muted/50 text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          {pay}
        </BadgePill>
      )}
      {positiveVisa && (
        <BadgePill className="border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Globe2 className="h-3 w-3" />
          Visa
        </BadgePill>
      )}
      {clearance && (
        <BadgePill className="border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400">
          <ShieldCheck className="h-3 w-3" />
          Clearance
        </BadgePill>
      )}
    </div>
  )
}

function JobActions({ job, compact = false }: { job: Job; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", compact && "shrink-0")}>
      <Link
        href={`/jobs/${job.id}`}
        aria-label={`View details for ${job.title} at ${job.company}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Details
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
      {job.jobUrl ? (
        <a
          href={job.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apply for ${job.title} at ${job.company}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Apply
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
          Apply
        </span>
      )}
    </div>
  )
}

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="mb-3 flex items-start gap-3">
        <CompanyMark job={job} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{job.company}</p>
          <p className="truncate text-[11px] text-muted-foreground">{job.department}</p>
        </div>
      </div>

      <h3 className="mb-2 line-clamp-2 text-[15px] font-semibold leading-snug text-card-foreground">
        {job.title}
      </h3>

      <div className="mb-3 flex items-center gap-1.5 text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">{job.location}</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <WorkTypePill type={job.locationType} />
        <BadgePill className={cn("bg-muted/40", employmentBadge[job.type] ?? "border-border text-muted-foreground")}>
          {job.type}
        </BadgePill>
      </div>

      <div className="mb-4">
        <JobSignals job={job} />
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-border/60 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(job.postedDate)}{job.dateProvenance === 'first_seen' ? ' · first seen' : job.dateProvenance === 'legacy_unknown' ? ' · date unverified' : ''}
        </div>
        <JobActions job={job} />
      </div>
    </article>
  )
}

export function JobListRow({ job }: { job: Job }) {
  return (
    <article className="rounded-lg border border-border/70 bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <CompanyMark job={job} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 text-sm font-semibold leading-snug text-card-foreground">
                {job.title}
              </h3>
              <span className="text-xs text-muted-foreground">at {job.company}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(job.postedDate)}{job.dateProvenance === 'first_seen' ? ' · first seen' : job.dateProvenance === 'legacy_unknown' ? ' · date unverified' : ''}
              </span>
              <span>{job.department}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:w-[360px]">
          <WorkTypePill type={job.locationType} />
          <BadgePill className={cn("bg-muted/40", employmentBadge[job.type] ?? "border-border text-muted-foreground")}>
            {job.type}
          </BadgePill>
          <JobSignals job={job} compact />
        </div>

        <JobActions job={job} compact />
      </div>
    </article>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="flex-1">
          <div className="mb-1.5 h-3 w-20 rounded bg-muted" />
          <div className="h-2.5 w-14 rounded bg-muted" />
        </div>
      </div>
      <div className="mb-1.5 h-4 w-full rounded bg-muted" />
      <div className="mb-4 h-4 w-3/4 rounded bg-muted" />
      <div className="mb-4 h-3 w-28 rounded bg-muted" />
      <div className="mb-4 flex gap-1.5">
        <div className="h-6 w-16 rounded-md bg-muted" />
        <div className="h-6 w-20 rounded-md bg-muted" />
      </div>
      <div className="flex justify-between border-t border-border/60 pt-3">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-8 w-32 rounded-lg bg-muted" />
      </div>
    </div>
  )
}
