"use client"

import Link from "next/link"
import Image from "next/image"
import { MapPin, Calendar, ExternalLink, ArrowUpRight } from "lucide-react"
import { type Job, formatDate } from "@/lib/job-data"

const workTypeBadge: Record<string, { bg: string; text: string; dot: string; border: string }> = {
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
  "Full-time": "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border border-violet-200/60 dark:border-violet-800/40",
  "Part-time": "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40",
  Contract: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40",
  Internship: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border border-pink-200/60 dark:border-pink-800/40",
}

export function JobCard({ job }: { job: Job }) {
  const wt = workTypeBadge[job.locationType] ?? workTypeBadge["Onsite"]

  return (
    <article className="group relative flex flex-col bg-card border border-border/60 rounded-2xl p-5 card-hover-glow hover:border-primary/30 overflow-hidden">
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-violet-500/0 group-hover:from-primary/[0.03] group-hover:to-violet-500/[0.03] transition-all duration-500 rounded-2xl pointer-events-none" />

      {/* Top: Logo + info + arrow */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-xl bg-muted/80 flex-shrink-0 overflow-hidden ring-2 ring-border/40 group-hover:ring-primary/20 transition-all duration-300">
            {job.companyIcon ? (
              <Image
                src={job.companyIcon}
                alt={job.company}
                fill
                className="object-contain p-1.5 bg-white dark:bg-white/90"
                sizes="44px"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: job.companyColor }}
              >
                {job.company.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <p className="text-[12px] font-medium text-muted-foreground leading-none mb-0.5">{job.company}</p>
            <p className="text-[11px] text-muted-foreground/60">{job.department}</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300 flex-shrink-0 opacity-0 group-hover:opacity-100">
          <ArrowUpRight className="w-4 h-4" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-[14px] font-semibold text-card-foreground mb-3 group-hover:text-primary transition-colors duration-200 line-clamp-2 leading-snug">
        {job.title}
      </h3>

      {/* Location */}
      <div className="flex items-center gap-1.5 mb-4 text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[13px] truncate">{job.location}</span>
      </div>

      <div className="flex-1" />

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${wt.bg} ${wt.text} ${wt.border}`}
          style={{ fontSize: "11px", fontWeight: 600 }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${wt.dot}`} />
          {job.locationType}
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full ${employmentBadge[job.type] ?? "bg-muted text-muted-foreground border border-border"}`}
          style={{ fontSize: "11px", fontWeight: 600 }}
        >
          {job.type}
        </span>
      </div>

      {/* Date + Apply */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span style={{ fontSize: "12px" }}>{formatDate(job.postedDate)}</span>
        </div>
        {job.jobUrl ? (
          <a
            href={job.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-all hover:from-indigo-600 hover:to-violet-600 shadow-sm shadow-indigo-500/20"
          >
            Apply
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-medium text-muted-foreground cursor-not-allowed">
            Apply
          </span>
        )}
      </div>

      <Link
        href={`/jobs/${job.id}`}
        className="absolute inset-0 rounded-2xl"
        aria-label={`View details for ${job.title} at ${job.company}`}
      >
        <span className="sr-only">View Details</span>
      </Link>
    </article>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 flex-shrink-0 rounded-xl bg-muted" />
          <div>
            <div className="h-2.5 w-16 rounded bg-muted mb-1.5" />
            <div className="h-2 w-10 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div className="h-4 w-full rounded bg-muted mb-1.5" />
      <div className="h-4 w-3/4 rounded bg-muted mb-4" />
      <div className="h-3 w-28 rounded bg-muted mb-4" />
      <div className="flex gap-1.5 mb-4">
        <div className="h-6 w-16 rounded-full bg-muted" />
        <div className="h-6 w-18 rounded-full bg-muted" />
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-7 w-16 rounded-lg bg-muted" />
      </div>
    </div>
  )
}
