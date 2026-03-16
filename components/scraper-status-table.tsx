"use client"

import { useState } from "react"
import Image from "next/image"
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, MinusCircle,
  Activity, ChevronDown, ChevronUp, Timer, Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ScraperStatus } from "@/lib/job-data"
import { cn } from "@/lib/utils"

function formatLastScraped(date: Date | null): string {
  if (!date) return "Never"

  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "-"
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function StatusIcon({ status, size = "sm" }: { status: ScraperStatus["status"]; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4"
  switch (status) {
    case "Successful":
      return <CheckCircle2 className={cn(cls, "text-emerald-500")} />
    case "Partial":
      return <AlertTriangle className={cn(cls, "text-amber-500")} />
    case "Error":
      return <XCircle className={cn(cls, "text-red-500")} />
    default:
      return <MinusCircle className={cn(cls, "text-muted-foreground/50")} />
  }
}

function statusBadgeStyles(status: ScraperStatus["status"]) {
  switch (status) {
    case "Successful":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
    case "Partial":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800"
    case "Error":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
    default:
      return "bg-muted/50 text-muted-foreground border-border"
  }
}

function StatusRow({ row }: { row: ScraperStatus }) {
  const [expanded, setExpanded] = useState(false)
  const hasError = row.status === "Error" && row.errorMessage

  return (
    <div
      className={cn(
        "group border-b border-border/50 last:border-b-0 transition-colors",
        hasError && "cursor-pointer",
        row.status === "Error" && "bg-red-50/30 dark:bg-red-950/10",
      )}
      onClick={hasError ? () => setExpanded(!expanded) : undefined}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        {/* Status icon */}
        <StatusIcon status={row.status} size="md" />

        {/* Company icon + name */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {row.companyIcon && (
            <Image
              src={row.companyIcon}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 shrink-0 rounded object-contain bg-white p-0.5"
            />
          )}
          <p className={cn(
            "font-medium text-sm truncate",
            row.status === "Not Run" && "text-muted-foreground"
          )}>
            {row.companyName}
          </p>
        </div>

        {/* Jobs count */}
        <div className="hidden sm:flex items-center justify-end w-20 shrink-0">
          <span className={cn(
            "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full",
            row.totalJobs > 0
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400"
              : "text-muted-foreground/50"
          )}>
            {row.totalJobs > 0 ? row.totalJobs.toLocaleString() : "—"}
          </span>
        </div>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn(
            "text-[11px] font-medium px-2 py-0.5 shrink-0",
            statusBadgeStyles(row.status)
          )}
        >
          {row.status === "Not Run" ? "Pending" : row.status}
        </Badge>

        {/* Last scraped */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground w-24 justify-end shrink-0">
          <Clock className="h-3 w-3" />
          <span>{formatLastScraped(row.lastScrapedAt)}</span>
        </div>

        {/* Duration */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground w-16 justify-end tabular-nums shrink-0">
          <Timer className="h-3 w-3" />
          <span>{formatDuration(row.durationSeconds)}</span>
        </div>

        {/* Expand indicator for errors */}
        {hasError && (
          <div className="text-muted-foreground/60">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        )}
      </div>

      {/* Mobile details row */}
      {row.lastScrapedAt && (
        <div className="flex sm:hidden items-center gap-4 px-4 pb-2 pl-12 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatLastScraped(row.lastScrapedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {formatDuration(row.durationSeconds)}
          </span>
        </div>
      )}

      {/* Error message (expandable) */}
      {expanded && hasError && (
        <div className="px-4 pb-3 pl-12 sm:px-5 sm:pl-14">
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2 font-mono leading-relaxed break-all">
            {row.errorMessage}
          </p>
        </div>
      )}
    </div>
  )
}

export function ScraperStatusTable({ statuses }: { statuses: ScraperStatus[] }) {
  const successCount = statuses.filter((s) => s.status === "Successful").length
  const errorCount = statuses.filter((s) => s.status === "Error").length
  const partialCount = statuses.filter((s) => s.status === "Partial").length
  const notRunCount = statuses.filter((s) => s.status === "Not Run").length
  const ranCount = statuses.length - notRunCount

  // Calculate total duration across all successful/partial runs
  const totalDuration = statuses.reduce((sum, s) => sum + (s.durationSeconds || 0), 0)

  // Find the most recent scrape time
  const lastRunTime = statuses
    .filter(s => s.lastScrapedAt)
    .sort((a, b) => (b.lastScrapedAt?.getTime() || 0) - (a.lastScrapedAt?.getTime() || 0))[0]?.lastScrapedAt

  // Sort: errors first, then partial, then not run, then successful
  const sortedStatuses = [...statuses].sort((a, b) => {
    const order: Record<string, number> = { "Error": 0, "Partial": 1, "Not Run": 2, "Successful": 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  const successRate = ranCount > 0 ? Math.round((successCount / ranCount) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Success rate card */}
        <div className="rounded-xl border border-border bg-card p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Health</p>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className={cn(
              "text-2xl font-bold",
              successRate >= 80 ? "text-emerald-600 dark:text-emerald-400" :
              successRate >= 50 ? "text-amber-600 dark:text-amber-400" :
              ranCount === 0 ? "text-muted-foreground" :
              "text-red-600 dark:text-red-400"
            )}>
              {ranCount === 0 ? "-" : `${successRate}%`}
            </p>
            {ranCount > 0 && (
              <p className="text-xs text-muted-foreground mb-1">{successCount}/{ranCount} ok</p>
            )}
          </div>
          {/* Progress bar */}
          {ranCount > 0 && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  successRate >= 80 ? "bg-emerald-500" :
                  successRate >= 50 ? "bg-amber-500" :
                  "bg-red-500"
                )}
                style={{ width: `${successRate}%` }}
              />
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Successful</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{successCount}</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Partial</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{partialCount}</p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-red-500" />
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Errors</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{errorCount}</p>
        </div>
      </div>

      {/* Meta info bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground px-1">
        {lastRunTime && (
          <span className="flex items-center gap-1.5">
            <Zap className="h-3 w-3" />
            Last run: {formatLastScraped(lastRunTime)}
          </span>
        )}
        {totalDuration > 0 && (
          <span className="flex items-center gap-1.5">
            <Timer className="h-3 w-3" />
            Total: {formatDuration(totalDuration)}
          </span>
        )}
        <span>{statuses.length} scrapers configured</span>
      </div>

      {/* Status list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground">
          <div className="w-5" /> {/* icon space */}
          <div className="flex-1">Company</div>
          <div className="hidden sm:block w-20 text-right">Jobs</div>
          <div className="w-20 text-center">Status</div>
          <div className="hidden sm:block w-24 text-right">Last Run</div>
          <div className="hidden sm:block w-16 text-right">Duration</div>
          <div className="w-4" /> {/* expand space */}
        </div>

        {/* Rows */}
        {sortedStatuses.map((row) => (
          <StatusRow key={row.companyName} row={row} />
        ))}
      </div>
    </div>
  )
}
