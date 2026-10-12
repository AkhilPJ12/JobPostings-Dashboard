"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, MinusCircle,
  Activity, ChevronDown, ChevronUp, Timer, Zap, Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ScraperStatus } from "@/lib/job-types"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | ScraperStatus["status"] | "zero-jobs"
type StatusSort = "status" | "last-run" | "jobs" | "duration" | "company"

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
          {/* Health warning: scraper ran successfully but found 0 jobs */}
          {row.status === "Successful" && row.totalJobs === 0 && (
            <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
              0 jobs
            </span>
          )}
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
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortBy, setSortBy] = useState<StatusSort>("status")
  const successCount = statuses.filter((s) => s.status === "Successful").length
  const errorCount = statuses.filter((s) => s.status === "Error").length
  const partialCount = statuses.filter((s) => s.status === "Partial").length
  const notRunCount = statuses.filter((s) => s.status === "Not Run").length
  const zeroJobCount = statuses.filter((s) => s.status === "Successful" && s.totalJobs === 0).length
  const ranCount = statuses.length - notRunCount

  // Calculate total duration across all successful/partial runs
  const totalDuration = statuses.reduce((sum, s) => sum + (s.durationSeconds || 0), 0)

  // Find the most recent scrape time
  const lastRunTime = statuses
    .filter(s => s.lastScrapedAt)
    .sort((a, b) => (b.lastScrapedAt?.getTime() || 0) - (a.lastScrapedAt?.getTime() || 0))[0]?.lastScrapedAt

  const visibleStatuses = useMemo(() => {
    const statusOrder: Record<string, number> = { "Error": 0, "Partial": 1, "Not Run": 2, "Successful": 3 }
    const normalizedQuery = query.trim().toLowerCase()
    let rows = [...statuses]

    if (normalizedQuery) {
      rows = rows.filter(row => row.companyName.toLowerCase().includes(normalizedQuery))
    }

    if (statusFilter === "zero-jobs") {
      rows = rows.filter(row => row.status === "Successful" && row.totalJobs === 0)
    } else if (statusFilter !== "all") {
      rows = rows.filter(row => row.status === statusFilter)
    }

    rows.sort((a, b) => {
      if (sortBy === "company") return a.companyName.localeCompare(b.companyName)
      if (sortBy === "jobs") return b.totalJobs - a.totalJobs
      if (sortBy === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0)
      if (sortBy === "last-run") return (b.lastScrapedAt?.getTime() || 0) - (a.lastScrapedAt?.getTime() || 0)
      return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)
    })

    return rows
  }, [query, sortBy, statusFilter, statuses])

  const successRate = ranCount > 0 ? Math.round((successCount / ranCount) * 100) : 0
  const filters: Array<{ label: string; value: StatusFilter; count: number }> = [
    { label: "All", value: "all", count: statuses.length },
    { label: "Errors", value: "Error", count: errorCount },
    { label: "Partial", value: "Partial", count: partialCount },
    { label: "Pending", value: "Not Run", count: notRunCount },
    { label: "0 jobs", value: "zero-jobs", count: zeroJobCount },
  ]

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Success rate card */}
        <div className="rounded-lg border border-border bg-card p-4 col-span-2 sm:col-span-1">
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Successful</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{successCount}</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Partial</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{partialCount}</p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/30">
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

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search scraper companies"
              placeholder="Search companies..."
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-border/70 bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" aria-label="Filter scraper status">
              {filters.map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === filter.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {filter.label}
                  <span className="ml-1 text-[10px] opacity-70">{filter.count}</span>
                </button>
              ))}
            </div>
            <select
              aria-label="Sort scraper status"
              value={sortBy}
              onChange={event => setSortBy(event.target.value as StatusSort)}
              className="h-9 rounded-lg border border-border/70 bg-background px-3 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            >
              <option value="status">Status</option>
              <option value="last-run">Last run</option>
              <option value="jobs">Jobs</option>
              <option value="duration">Duration</option>
              <option value="company">Company</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {visibleStatuses.length} of {statuses.length} scrapers.
        </p>
      </div>

      {/* Status list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
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
        {visibleStatuses.map((row) => (
          <StatusRow key={row.companyName} row={row} />
        ))}
        {visibleStatuses.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No scraper statuses match the current filters.
          </div>
        )}
      </div>
    </div>
  )
}
