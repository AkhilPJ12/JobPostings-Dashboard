"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Link from "next/link"
import { useRouter } from 'next/navigation'
import {
  Activity,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Grid3X3,
  HelpCircle,
  List,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Job, ScraperStatus } from "@/lib/job-types"
import type { EnrichmentHealth } from '@/lib/modules/jobs/repository'
import { toSearchParams, type JobFacets, type JobSearchQuery } from '@/lib/modules/jobs/contracts'
import { FilterSidebar, type Filters } from "@/components/filter-sidebar"
import { JobCard, JobCardSkeleton, JobListRow } from "@/components/job-card"
import { ThemeToggle } from "@/components/theme-toggle"
import { ScraperStatusTable } from "@/components/scraper-status-table"

const ITEMS_PER_PAGE = 20
const FILTERS_STORAGE_KEY = "job-dashboard-filters"
const SEARCH_STORAGE_KEY = "job-dashboard-search"
const SORT_STORAGE_KEY = "job-dashboard-sort"
const PAGE_STORAGE_KEY = "job-dashboard-page"
const VIEW_STORAGE_KEY = "job-dashboard-view"

const defaultFilters: Filters = {
  companies: [],
  locationTypes: [],
  departments: [],
  datePosted: "all",
  employmentTypes: [],
  visaSponsorship: [],
  securityClearance: [],
}

type ViewMode = "grid" | "list"
type MultiFilterKey =
  | "companies"
  | "locationTypes"
  | "departments"
  | "employmentTypes"
  | "visaSponsorship"
  | "securityClearance"

function normalizeFilters(value: Partial<Filters> | null | undefined): Filters {
  return {
    companies: Array.isArray(value?.companies) ? value.companies : [],
    locationTypes: Array.isArray(value?.locationTypes) ? value.locationTypes : [],
    departments: Array.isArray(value?.departments) ? value.departments : [],
    datePosted: typeof value?.datePosted === "string" ? value.datePosted : "all",
    employmentTypes: Array.isArray(value?.employmentTypes) ? value.employmentTypes : [],
    visaSponsorship: Array.isArray(value?.visaSponsorship) ? value.visaSponsorship : [],
    securityClearance: Array.isArray(value?.securityClearance) ? value.securityClearance : [],
  }
}

function loadFromSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const stored = sessionStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

function saveToSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const chipColors = {
  companies: "bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-900",
  locationTypes: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/60",
  departments: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-950/60",
  employmentTypes: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-950/60",
  visaSponsorship: "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/50 hover:bg-teal-100 dark:hover:bg-teal-950/60",
  securityClearance: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-950/60",
  date: "bg-muted text-muted-foreground border border-border hover:bg-muted/80",
}

type FilterChip = { label: string; className: string; onRemove: () => void }

type JobDashboardProps = {
  initialJobs?: Job[]
  initialCompanyCount?: number
  initialScraperStatuses?: ScraperStatus[]
  initialPagedJobs?: { jobs: Job[]; total: number; page: number; pageSize: number }
  initialQuery?: JobSearchQuery
  initialFacets?: JobFacets
}

export function JobDashboard({
  initialJobs = [],
  initialCompanyCount = 0,
  initialScraperStatuses = [],
  initialPagedJobs,
  initialQuery,
  initialFacets,
}: JobDashboardProps = {}) {
  const router = useRouter()
  const serverMode = Boolean(initialPagedJobs && initialQuery)
  const [activeView, setActiveView] = useState<"jobs" | "status">("jobs")
  const jobs = initialJobs
  const [scraperStatuses, setScraperStatuses] = useState(initialScraperStatuses)
  const [enrichmentHealth, setEnrichmentHealth] = useState<EnrichmentHealth | null>(null)
  const companyCount = initialCompanyCount
  const [filters, setFilters] = useState<Filters>(() => initialQuery ? {
    companies: initialQuery.companies, locationTypes: initialQuery.locationTypes,
    departments: initialQuery.departments, datePosted: initialQuery.datePosted,
    employmentTypes: initialQuery.employmentTypes, visaSponsorship: initialQuery.visaSponsorship,
    securityClearance: initialQuery.securityClearance,
  } : normalizeFilters(loadFromSession(FILTERS_STORAGE_KEY, defaultFilters)))
  const [searchQuery, setSearchQuery] = useState(() => initialQuery?.q ?? loadFromSession(SEARCH_STORAGE_KEY, ""))
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialQuery?.q ?? loadFromSession(SEARCH_STORAGE_KEY, ""))
  const [sortBy, setSortBy] = useState(() => initialQuery?.sort ?? loadFromSession(SORT_STORAGE_KEY, "recent"))
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadFromSession<ViewMode>(VIEW_STORAGE_KEY, "grid") === "list" ? "list" : "grid")
  const [currentPage, setCurrentPage] = useState(() => initialQuery?.page ?? loadFromSession(PAGE_STORAGE_KEY, 1))
  const [isLoading, setIsLoading] = useState(false)
  const [isStatusLoading, setIsStatusLoading] = useState(false)
  const error: string | null = null
  const [statusError, setStatusError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    if (searchQuery === debouncedSearch) return
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => { if (!serverMode) saveToSession(FILTERS_STORAGE_KEY, filters) }, [filters, serverMode])
  useEffect(() => { if (!serverMode) saveToSession(SEARCH_STORAGE_KEY, debouncedSearch) }, [debouncedSearch, serverMode])
  useEffect(() => { if (!serverMode) saveToSession(SORT_STORAGE_KEY, sortBy) }, [sortBy, serverMode])
  useEffect(() => { saveToSession(VIEW_STORAGE_KEY, viewMode) }, [viewMode])
  useEffect(() => { if (!serverMode) saveToSession(PAGE_STORAGE_KEY, currentPage) }, [currentPage, serverMode])

  useEffect(() => {
    if (!serverMode || !initialQuery) return
    const next: JobSearchQuery = {
      ...initialQuery, q: debouncedSearch, page: currentPage,
      sort: sortBy === 'company' || sortBy === 'title' ? sortBy : 'recent',
      companies: filters.companies, locationTypes: filters.locationTypes,
      departments: filters.departments, employmentTypes: filters.employmentTypes,
      visaSponsorship: filters.visaSponsorship, securityClearance: filters.securityClearance,
      datePosted: filters.datePosted === 'today' || filters.datePosted === '7days' || filters.datePosted === '14days' ? filters.datePosted : 'all',
    }
    const nextSearch = toSearchParams(next).toString()
    const currentSearch = toSearchParams(initialQuery).toString()
    if (nextSearch !== currentSearch) {
      setIsLoading(true)
      router.replace(nextSearch ? `/?${nextSearch}` : '/', { scroll: false })
    }
  }, [serverMode, initialQuery, debouncedSearch, currentPage, sortBy, filters, router])

  useEffect(() => {
    if (activeView !== 'status' || !serverMode || scraperStatuses.length) return
    let alive = true
    setIsStatusLoading(true)
    fetch('/api/scraper-status').then(async response => {
      if (!response.ok) throw new Error('Unable to load status')
      return response.json()
    }).then((payload: { statuses: ScraperStatus[]; enrichment: EnrichmentHealth }) => {
      if (alive) setScraperStatuses(payload.statuses.map((row: ScraperStatus) => ({
        ...row, lastScrapedAt: row.lastScrapedAt ? new Date(row.lastScrapedAt) : null,
      })))
      if (alive) setEnrichmentHealth(payload.enrichment)
    }).catch(error => { if (alive) setStatusError(error.message) })
      .finally(() => { if (alive) setIsStatusLoading(false) })
    return () => { alive = false }
  }, [activeView, serverMode, scraperStatuses.length])

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(normalizeFilters(newFilters))
    setCurrentPage(1)
  }, [])

  const toggleFilterValue = useCallback((key: MultiFilterKey, value: string) => {
    setFilters(current => {
      const values = current[key]
      const updated = values.includes(value)
        ? values.filter(v => v !== value)
        : [...values, value]
      return { ...current, [key]: updated }
    })
    setCurrentPage(1)
  }, [])

  const activeFilterCount = useMemo(() => {
    return filters.companies.length +
      filters.locationTypes.length +
      filters.departments.length +
      filters.employmentTypes.length +
      filters.visaSponsorship.length +
      filters.securityClearance.length +
      (filters.datePosted !== "all" ? 1 : 0)
  }, [filters])

  const filteredJobs = useMemo(() => {
    if (serverMode) return jobs
    let result = [...jobs]
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(job =>
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query) ||
        job.department.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query)
      )
    }
    if (filters.companies.length > 0) result = result.filter(job => filters.companies.includes(job.company))
    if (filters.locationTypes.length > 0) result = result.filter(job => filters.locationTypes.includes(job.locationType))
    if (filters.departments.length > 0) result = result.filter(job => filters.departments.includes(job.department))
    if (filters.employmentTypes.length > 0) result = result.filter(job => filters.employmentTypes.includes(job.type))
    if (filters.visaSponsorship.length > 0) result = result.filter(job => filters.visaSponsorship.includes(job.visaSponsorship))
    if (filters.securityClearance.length > 0) result = result.filter(job => filters.securityClearance.includes(job.securityClearance))
    if (filters.datePosted !== "all") {
      const cutoff = new Date()
      if (filters.datePosted === "7days") cutoff.setDate(cutoff.getDate() - 7)
      else if (filters.datePosted === "14days") cutoff.setDate(cutoff.getDate() - 14)
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
      result = result.filter(job => (job.postedDate || '') >= cutoffStr)
    }
    if (sortBy === "recent") result.sort((a, b) => (b.postedDate || '').localeCompare(a.postedDate || ''))
    else if (sortBy === "company") result.sort((a, b) => a.company.localeCompare(b.company))
    else if (sortBy === "title") result.sort((a, b) => a.title.localeCompare(b.title))
    return result
  }, [jobs, debouncedSearch, filters, sortBy, serverMode])

  const resultCount = serverMode ? initialPagedJobs!.total : filteredJobs.length
  const totalPages = Math.ceil(resultCount / (serverMode ? initialPagedJobs!.pageSize : ITEMS_PER_PAGE))
  const paginatedJobs = serverMode ? jobs : filteredJobs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    const addChips = (key: MultiFilterKey, className: string, labelPrefix = "") => {
      filters[key].forEach(value => chips.push({
        label: `${labelPrefix}${value}`,
        className,
        onRemove: () => handleFiltersChange({ ...filters, [key]: filters[key].filter(v => v !== value) }),
      }))
    }

    addChips("companies", chipColors.companies)
    addChips("locationTypes", chipColors.locationTypes)
    addChips("departments", chipColors.departments)
    addChips("employmentTypes", chipColors.employmentTypes)
    addChips("visaSponsorship", chipColors.visaSponsorship, "Visa: ")
    addChips("securityClearance", chipColors.securityClearance, "Clearance: ")

    if (filters.datePosted !== "all") {
      const label = filters.datePosted === "today" ? "Today" : filters.datePosted === "7days" ? "Last 7 days" : "Last 14 days"
      chips.push({
        label,
        className: chipColors.date,
        onRemove: () => handleFiltersChange({ ...filters, datePosted: "all" }),
      })
    }
    return chips
  }, [filters, handleFiltersChange])

  const quickFilters = [
    { label: "Remote", icon: Globe2, active: filters.locationTypes.includes("Remote"), onClick: () => toggleFilterValue("locationTypes", "Remote") },
    { label: "Hybrid", icon: Building2, active: filters.locationTypes.includes("Hybrid"), onClick: () => toggleFilterValue("locationTypes", "Hybrid") },
    { label: "Full-time", icon: Briefcase, active: filters.employmentTypes.includes("Full-time"), onClick: () => toggleFilterValue("employmentTypes", "Full-time") },
    { label: "Visa sponsorship", icon: Globe2, active: filters.visaSponsorship.includes("Yes"), onClick: () => toggleFilterValue("visaSponsorship", "Yes") },
    { label: "Security clearance", icon: ShieldCheck, active: filters.securityClearance.includes("Yes"), onClick: () => toggleFilterValue("securityClearance", "Yes") },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 glass-strong">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90">
              <Zap className="h-5 w-5" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="leading-none text-[17px] font-bold text-foreground" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                JobBoard
              </span>
                <span className="text-muted-foreground leading-none text-[10px] font-medium">Recent roles</span>
            </div>
          </Link>

          <nav className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/80 p-1">
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeView === "jobs"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
              }`}
              onClick={() => setActiveView("jobs")}
            >
              <Briefcase className={`h-4 w-4 ${activeView === "jobs" ? "text-primary" : ""}`} />
              <span className="hidden sm:inline">Jobs</span>
              {activeView === "jobs" && resultCount > 0 && (
                <span className="hidden min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary sm:flex">
                  {resultCount.toLocaleString()}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeView === "status"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
              }`}
              onClick={() => setActiveView("status")}
            >
              <Activity className={`h-4 w-4 ${activeView === "status" ? "text-primary" : ""}`} />
              <span className="hidden sm:inline">Scrapers</span>
            </button>
          </nav>

          <div className="flex-1" />

          <div className="hidden items-center gap-2 lg:flex">
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/60 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{resultCount.toLocaleString()}</span> jobs
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/60 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{companyCount}</span> companies
              </span>
            </div>
          </div>

          <Link
            href="/support"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden md:inline">Support</span>
          </Link>

          <ThemeToggle />
        </div>
      </header>

      {activeView === "status" ? (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Scraper Status</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Monitor each company scraper and spot stale or empty runs.</p>
            </div>
            <span className="text-xs text-muted-foreground">{scraperStatuses.length} configured scrapers</span>
          </div>
          {enrichmentHealth && (
            <div className="mb-5 rounded-lg border border-border/60 bg-card p-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">AI enrichment:</span>{' '}
              {enrichmentHealth.pending.toLocaleString()} pending · {enrichmentHealth.failed.toLocaleString()} failed
              {enrichmentHealth.oldestPendingAt && ` · oldest queued ${new Date(enrichmentHealth.oldestPendingAt).toLocaleDateString()}`}
            </div>
          )}
          {isStatusLoading ? (
            <div className="rounded-lg border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto mb-3 h-6 w-6 animate-spin" />
              Loading scraper status...
            </div>
          ) : statusError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              Failed to load scraper status: {statusError}
            </div>
          ) : (
            <ScraperStatusTable statuses={scraperStatuses} />
          )}
        </main>
      ) : (
        <>
          <section className="border-b border-border/60 bg-card">
            <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Find Your Dream Job</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {resultCount.toLocaleString()} active roles from {companyCount}+ companies. Updated twice daily.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-lg border border-border/60 bg-muted/50 px-3 py-1.5">{resultCount.toLocaleString()} results</span>
                  <span className="rounded-lg border border-border/60 bg-muted/50 px-3 py-1.5">Last 14 days</span>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search title, company, department, location..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-11 w-full rounded-lg border border-border/70 bg-background pl-10 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    aria-label="Search jobs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      activeFilterCount > 0
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/70 text-foreground hover:bg-muted"
                    }`}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  <Select value={sortBy} onValueChange={value => setSortBy(value === 'company' || value === 'title' ? value : 'recent')}>
                    <SelectTrigger className="h-10 w-[142px] rounded-lg text-xs border-border/70" aria-label="Sort jobs">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most Recent</SelectItem>
                      <SelectItem value="company">Company A-Z</SelectItem>
                      <SelectItem value="title">Title A-Z</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex h-10 items-center rounded-lg border border-border/70 bg-muted/40 p-1" aria-label="View mode">
                    <button
                      type="button"
                      aria-label="Grid view"
                      aria-pressed={viewMode === "grid"}
                      onClick={() => setViewMode("grid")}
                      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                        viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Grid3X3 className="h-3.5 w-3.5" />
                      Grid
                    </button>
                    <button
                      type="button"
                      aria-label="List view"
                      aria-pressed={viewMode === "list"}
                      onClick={() => setViewMode("list")}
                      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
                        viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                      List
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {quickFilters.map(({ label, icon: Icon, active, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={onClick}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="sticky top-16 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2.5 lg:px-6">
              <span className="text-xs font-medium text-muted-foreground">
                {resultCount.toLocaleString()} result{resultCount === 1 ? "" : "s"}
              </span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {activeFilterChips.map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={chip.onRemove}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${chip.className}`}
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                {activeFilterChips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFiltersChange(defaultFilters)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>

          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading jobs">
                {Array.from({ length: 12 }).map((_, i) => <JobCardSkeleton key={i} />)}
                <span className="sr-only">Loading job listings...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
                <h3 className="text-base font-semibold text-destructive">Failed to load jobs</h3>
                <p className="mt-1.5 max-w-sm text-sm text-destructive/70">{error}</p>
              </div>
            ) : paginatedJobs.length > 0 ? (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {paginatedJobs.map(job => <JobCard key={job.id} job={job} />)}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {paginatedJobs.map(job => <JobListRow key={job.id} job={job} />)}
                  </div>
                )}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      aria-label="Go to previous page"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1.5 rounded-lg border border-border/70 px-4 py-2.5 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                          return (
                            <button
                              type="button"
                              aria-label={`Go to page ${page}`}
                              aria-current={currentPage === page ? "page" : undefined}
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`h-10 min-w-[40px] rounded-lg px-3 text-sm transition-colors ${
                                currentPage === page
                                  ? "bg-primary text-primary-foreground font-semibold"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-muted-foreground">...</span>
                        }
                        return null
                      })}
                    </div>
                    <button
                      type="button"
                      aria-label="Go to next page"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1.5 rounded-lg border border-border/70 px-4 py-2.5 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border/70 bg-card py-20 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Search className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">No jobs found</h3>
                <p className="mb-7 max-w-sm text-sm text-muted-foreground">
                  Try adjusting your filters or search query to find more results.
                </p>
                {(activeFilterCount > 0 || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => { handleFiltersChange(defaultFilters); setSearchQuery("") }}
                    className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <X className="h-4 w-4" />
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </main>

          <FilterSidebar
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            jobs={jobs}
            resultCount={resultCount}
            facets={initialFacets}
          />
        </>
      )}
    </div>
  )
}
