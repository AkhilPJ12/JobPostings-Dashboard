"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import Link from "next/link"
import {
  Search,
  X,
  SlidersHorizontal,
  Briefcase,
  Activity,
  HelpCircle,
  Building2,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getJobs,
  getUniqueCompanyCount,
  getScraperStatuses,
  type Job,
  type ScraperStatus,
} from "@/lib/job-data"
import { FilterSidebar, type Filters } from "@/components/filter-sidebar"
import { JobCard, JobCardSkeleton } from "@/components/job-card"
import { ThemeToggle } from "@/components/theme-toggle"
import { ScraperStatusTable } from "@/components/scraper-status-table"

const ITEMS_PER_PAGE = 20
const FILTERS_STORAGE_KEY = "job-dashboard-filters"
const SEARCH_STORAGE_KEY = "job-dashboard-search"
const SORT_STORAGE_KEY = "job-dashboard-sort"
const PAGE_STORAGE_KEY = "job-dashboard-page"

const defaultFilters: Filters = {
  companies: [],
  locationTypes: [],
  departments: [],
  datePosted: "all",
  employmentTypes: [],
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

// Chip color classes by filter type
const chipColors = {
  companies: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60",
  locationTypes: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60",
  departments: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40 hover:bg-violet-100 dark:hover:bg-violet-950/60",
  employmentTypes: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200/60 dark:border-pink-800/40 hover:bg-pink-100 dark:hover:bg-pink-950/60",
  date: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-950/60",
}

type FilterChip = { label: string; className: string; onRemove: () => void }

type JobDashboardProps = {
  initialJobs?: Job[]
  initialCompanyCount?: number
  initialScraperStatuses?: ScraperStatus[]
}

export function JobDashboard({
  initialJobs,
  initialCompanyCount,
  initialScraperStatuses,
}: JobDashboardProps = {}) {
  const hasInitialData = !!(initialJobs && initialJobs.length > 0)
  const [activeView, setActiveView] = useState<"jobs" | "status">("jobs")
  const [jobs, setJobs] = useState<Job[]>(initialJobs || [])
  const [scraperStatuses, setScraperStatuses] = useState<ScraperStatus[]>(initialScraperStatuses || [])
  const [companyCount, setCompanyCount] = useState<number>(initialCompanyCount || 0)
  const [filters, setFilters] = useState<Filters>(() => loadFromSession(FILTERS_STORAGE_KEY, defaultFilters))
  const [searchQuery, setSearchQuery] = useState(() => loadFromSession(SEARCH_STORAGE_KEY, ""))
  const [debouncedSearch, setDebouncedSearch] = useState(() => loadFromSession(SEARCH_STORAGE_KEY, ""))
  const [sortBy, setSortBy] = useState(() => loadFromSession(SORT_STORAGE_KEY, "recent"))
  const [currentPage, setCurrentPage] = useState(() => loadFromSession(PAGE_STORAGE_KEY, 1))
  const [isLoading, setIsLoading] = useState(!hasInitialData)
  const [isStatusLoading, setIsStatusLoading] = useState(!hasInitialData)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    if (hasInitialData) return
    async function fetchJobs() {
      try {
        setIsLoading(true)
        setIsStatusLoading(true)
        setError(null)
        setStatusError(null)
        const [fetchedJobs, count, statuses] = await Promise.all([
          getJobs(),
          getUniqueCompanyCount(),
          getScraperStatuses(),
        ])
        setJobs(fetchedJobs)
        setCompanyCount(count)
        setScraperStatuses(statuses)
      } catch (err) {
        console.error('Error fetching jobs:', err)
        setError(err instanceof Error ? err.message : 'Failed to load jobs')
        setStatusError(err instanceof Error ? err.message : 'Failed to load scraper status')
      } finally {
        setIsLoading(false)
        setIsStatusLoading(false)
      }
    }
    fetchJobs()
  }, [hasInitialData])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => { saveToSession(FILTERS_STORAGE_KEY, filters) }, [filters])
  useEffect(() => { saveToSession(SEARCH_STORAGE_KEY, debouncedSearch) }, [debouncedSearch])
  useEffect(() => { saveToSession(SORT_STORAGE_KEY, sortBy) }, [sortBy])
  useEffect(() => { saveToSession(PAGE_STORAGE_KEY, currentPage) }, [currentPage])

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters)
    setCurrentPage(1)
  }, [])

  const activeFilterCount = useMemo(() => {
    return filters.companies.length +
      filters.locationTypes.length +
      filters.departments.length +
      filters.employmentTypes.length +
      (filters.datePosted !== "all" ? 1 : 0)
  }, [filters])

  const filteredJobs = useMemo(() => {
    let result = [...jobs]
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(job =>
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query) ||
        job.department.toLowerCase().includes(query)
      )
    }
    if (filters.companies.length > 0) result = result.filter(job => filters.companies.includes(job.company))
    if (filters.locationTypes.length > 0) result = result.filter(job => filters.locationTypes.includes(job.locationType))
    if (filters.departments.length > 0) result = result.filter(job => filters.departments.includes(job.department))
    if (filters.datePosted !== "all") {
      const cutoff = new Date()
      if (filters.datePosted === "7days") cutoff.setDate(cutoff.getDate() - 7)
      else if (filters.datePosted === "14days") cutoff.setDate(cutoff.getDate() - 14)
      // Use local date string to avoid UTC-vs-local mismatch for "today" filter
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
      result = result.filter(job => (job.postedDate || '') >= cutoffStr)
    }
    if (filters.employmentTypes.length > 0) result = result.filter(job => filters.employmentTypes.includes(job.type))
    if (sortBy === "recent") result.sort((a, b) => (b.postedDate || '').localeCompare(a.postedDate || ''))
    else if (sortBy === "company") result.sort((a, b) => a.company.localeCompare(b.company))
    else if (sortBy === "title") result.sort((a, b) => a.title.localeCompare(b.title))
    return result
  }, [jobs, debouncedSearch, filters, sortBy])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const activeFilterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    filters.companies.forEach(c => chips.push({
      label: c,
      className: chipColors.companies,
      onRemove: () => handleFiltersChange({ ...filters, companies: filters.companies.filter(v => v !== c) }),
    }))
    filters.locationTypes.forEach(t => chips.push({
      label: t,
      className: chipColors.locationTypes,
      onRemove: () => handleFiltersChange({ ...filters, locationTypes: filters.locationTypes.filter(v => v !== t) }),
    }))
    filters.departments.forEach(d => chips.push({
      label: d,
      className: chipColors.departments,
      onRemove: () => handleFiltersChange({ ...filters, departments: filters.departments.filter(v => v !== d) }),
    }))
    filters.employmentTypes.forEach(t => chips.push({
      label: t,
      className: chipColors.employmentTypes,
      onRemove: () => handleFiltersChange({ ...filters, employmentTypes: filters.employmentTypes.filter(v => v !== t) }),
    }))
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow duration-300">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="gradient-text leading-none text-[17px] font-bold" style={{ fontFamily: "var(--font-space-grotesk)", letterSpacing: "-0.02em" }}>
                JobBoard
              </span>
              <span className="text-muted-foreground leading-none text-[10px] font-medium">AI-powered</span>
            </div>
          </Link>

          {/* Nav tabs */}
          <nav className="flex items-center gap-0.5 rounded-xl bg-muted/80 p-1 shrink-0">
            <button
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeView === "jobs"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
              onClick={() => setActiveView("jobs")}
            >
              {activeView === "jobs" && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20" />
              )}
              <Briefcase className={`h-4 w-4 ${activeView === "jobs" ? "text-primary" : ""}`} />
              <span className="hidden sm:inline">Jobs</span>
              {activeView === "jobs" && jobs.length > 0 && (
                <span className="hidden sm:flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                  {jobs.length.toLocaleString()}
                </span>
              )}
            </button>
            <button
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeView === "status"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
              onClick={() => setActiveView("status")}
            >
              {activeView === "status" && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20" />
              )}
              <Activity className={`h-4 w-4 ${activeView === "status" ? "text-primary" : ""}`} />
              <span className="hidden sm:inline">Scrapers</span>
              {activeView === "status" && (
                <span className="hidden sm:flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                  Live
                </span>
              )}
            </button>
          </nav>

          <div className="flex-1" />

          {/* Stats */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/50">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-muted-foreground text-xs">
                <span className="font-semibold text-foreground">{jobs.length.toLocaleString()}</span> jobs
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/50">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground text-xs">
                <span className="font-semibold text-foreground">{companyCount}</span> companies
              </span>
            </div>
          </div>

          <Link
            href="/support"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground hover:bg-muted/60"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden md:inline">Support</span>
          </Link>

          <ThemeToggle />
        </div>
      </header>

      {/* Status view */}
      {activeView === "status" ? (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-foreground">Scraper Status</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Monitor the health and timing of each company scraper</p>
          </div>
          {isStatusLoading ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
              <Activity className="mx-auto mb-3 h-6 w-6 animate-spin" />
              Loading scraper status...
            </div>
          ) : statusError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              Failed to load scraper status: {statusError}
            </div>
          ) : (
            <ScraperStatusTable statuses={scraperStatuses} />
          )}
        </main>
      ) : (
        <>
          {/* Hero Section */}
          <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-purple-500/5">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.08),transparent_60%)] pointer-events-none" />
            <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-8">
              <div className="mb-5">
                <h1 className="gradient-text text-2xl font-bold mb-1.5">Find Your Dream Job</h1>
                <p className="text-muted-foreground text-sm">Aggregated from {companyCount}+ top companies · Updated twice daily</p>
              </div>

              {/* Search + note */}
              <div className="mb-5">
                <div className="relative max-w-2xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search jobs, companies, skills..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 bg-card border border-border/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 shadow-sm transition-all duration-200 placeholder:text-muted-foreground/60 text-sm"
                    aria-label="Search jobs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground/70 flex items-center gap-1.5 max-w-2xl">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                  Only jobs posted within the last 14 days are shown. Listings older than 14 days are automatically removed. New jobs are added daily.
                </p>
              </div>

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-card/80 border border-border/50 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm">{jobs.length.toLocaleString()}</span>
                    <span className="text-muted-foreground ml-1 text-[13px]">active jobs</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-card/80 border border-border/50 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm">{companyCount}</span>
                    <span className="text-muted-foreground ml-1 text-[13px]">companies</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="sticky top-16 z-30 border-b border-border/60 bg-card/90 backdrop-blur-md shadow-sm">
            <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Filter button */}
                <button
                  onClick={() => setFiltersOpen(true)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200 text-sm ${
                    activeFilterCount > 0
                      ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15"
                      : "border-border/60 hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Color-coded filter chips */}
                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                  {activeFilterChips.map(chip => (
                    <button
                      key={chip.label}
                      onClick={chip.onRemove}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${chip.className}`}
                    >
                      {chip.label}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                  {activeFilterChips.length > 0 && (
                    <button
                      onClick={() => handleFiltersChange(defaultFilters)}
                      className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 text-xs"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Result count + Sort */}
                <div className="flex items-center gap-3 ml-auto">
                  <span className="hidden text-xs text-muted-foreground sm:block whitespace-nowrap">
                    <span className="font-semibold text-foreground">{filteredJobs.length.toLocaleString()}</span>
                    {filteredJobs.length !== jobs.length && (
                      <span className="text-muted-foreground/60"> / {jobs.length.toLocaleString()}</span>
                    )}
                    {" "}results
                  </span>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-9 w-[140px] rounded-xl text-xs border-border/60" aria-label="Sort jobs">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most Recent</SelectItem>
                      <SelectItem value="company">Company A-Z</SelectItem>
                      <SelectItem value="title">Title A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-6 py-8">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading jobs">
                {Array.from({ length: 12 }).map((_, i) => <JobCardSkeleton key={i} />)}
                <span className="sr-only">Loading job listings...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
                <h3 className="text-base font-semibold text-destructive">Failed to load jobs</h3>
                <p className="mt-1.5 max-w-sm text-sm text-destructive/70">{error}</p>
              </div>
            ) : paginatedJobs.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedJobs.map(job => <JobCard key={job.id} job={job} />)}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-10">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-border/60 rounded-xl hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`min-w-[40px] h-10 px-3 rounded-xl transition-all duration-200 text-sm ${
                                currentPage === page
                                  ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20 font-semibold"
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-muted-foreground">…</span>
                        }
                        return null
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-border/60 rounded-xl hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-30" />
                  <div className="relative w-24 h-24 bg-muted/80 border border-border/60 rounded-full flex items-center justify-center">
                    <Search className="w-10 h-10 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No jobs found</h3>
                <p className="text-muted-foreground mb-8 max-w-sm text-sm">
                  Try adjusting your filters or search query to find more results
                </p>
                {(activeFilterCount > 0 || searchQuery) && (
                  <button
                    onClick={() => { handleFiltersChange(defaultFilters); setSearchQuery("") }}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filter Slide-in Panel */}
          <FilterSidebar
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            activeFilterCount={activeFilterCount}
          />
        </>
      )}
    </div>
  )
}
