"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import {
  Search,
  X,
  SlidersHorizontal,
  Briefcase,
  Building2,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { jobs, getUniqueCompanyCount, type Job } from "@/lib/job-data"
import { FilterSidebar, type Filters } from "@/components/filter-sidebar"
import { JobCard, JobCardSkeleton } from "@/components/job-card"
import { JobPagination } from "@/components/job-pagination"
import { ThemeToggle } from "@/components/theme-toggle"

const ITEMS_PER_PAGE = 12

const defaultFilters: Filters = {
  companies: [],
  locationTypes: [],
  departments: [],
  datePosted: "all",
  employmentTypes: [],
}

export function JobDashboard() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Simulate initial load
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page when filters change
  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters)
    setCurrentPage(1)
  }, [])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.companies.length > 0) count++
    if (filters.locationTypes.length > 0) count++
    if (filters.departments.length > 0) count++
    if (filters.datePosted !== "all") count++
    if (filters.employmentTypes.length > 0) count++
    return count
  }, [filters])

  const filteredJobs = useMemo(() => {
    let result = [...jobs]

    // Search filter
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          job.description.toLowerCase().includes(query) ||
          job.department.toLowerCase().includes(query)
      )
    }

    // Company filter
    if (filters.companies.length > 0) {
      result = result.filter((job) => filters.companies.includes(job.company))
    }

    // Location type filter
    if (filters.locationTypes.length > 0) {
      result = result.filter((job) =>
        filters.locationTypes.includes(job.locationType)
      )
    }

    // Department filter
    if (filters.departments.length > 0) {
      result = result.filter((job) =>
        filters.departments.includes(job.department)
      )
    }

    // Date posted filter
    if (filters.datePosted !== "all") {
      const now = new Date()
      const cutoff = new Date()
      if (filters.datePosted === "today") {
        cutoff.setHours(0, 0, 0, 0)
      } else if (filters.datePosted === "7days") {
        cutoff.setDate(now.getDate() - 7)
      } else if (filters.datePosted === "30days") {
        cutoff.setDate(now.getDate() - 30)
      }
      result = result.filter((job) => job.postedDate >= cutoff)
    }

    // Employment type filter
    if (filters.employmentTypes.length > 0) {
      result = result.filter((job) =>
        filters.employmentTypes.includes(job.type)
      )
    }

    // Sort
    if (sortBy === "recent") {
      result.sort((a, b) => b.postedDate.getTime() - a.postedDate.getTime())
    } else if (sortBy === "company") {
      result.sort((a, b) => a.company.localeCompare(b.company))
    } else if (sortBy === "title") {
      result.sort((a, b) => a.title.localeCompare(b.title))
    }

    return result
  }, [debouncedSearch, filters, sortBy])

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE)
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (filters.locationTypes.length > 0)
      labels.push(...filters.locationTypes)
    if (filters.departments.length > 0)
      labels.push(...filters.departments)
    if (filters.companies.length > 0 && filters.companies.length <= 2)
      labels.push(...filters.companies)
    else if (filters.companies.length > 2)
      labels.push(`${filters.companies.length} companies`)
    if (filters.employmentTypes.length > 0)
      labels.push(...filters.employmentTypes)
    if (filters.datePosted === "today") labels.push("Today")
    else if (filters.datePosted === "7days") labels.push("Last 7 days")
    else if (filters.datePosted === "30days") labels.push("Last 30 days")
    return labels
  }, [filters])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Briefcase className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="hidden text-lg font-bold text-foreground sm:block">
              Job Dashboard
            </h1>
          </div>

          {/* Search bar */}
          <div className="relative mx-auto w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search jobs by title, skills, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 bg-muted/40 pl-10 pr-10 text-sm placeholder:text-muted-foreground/70"
              aria-label="Search jobs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="hidden shrink-0 items-center gap-1.5 text-sm text-muted-foreground lg:flex">
            <Briefcase className="h-4 w-4" />
            <span>
              <span className="font-semibold text-foreground">{jobs.length}</span> jobs
            </span>
            <span className="text-border">{"/"}</span>
            <Building2 className="h-4 w-4" />
            <span>
              <span className="font-semibold text-foreground">
                {getUniqueCompanyCount()}
              </span>{" "}
              companies
            </span>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Mobile filter trigger */}
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative shrink-0 lg:hidden"
                aria-label="Open filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <FilterSidebar
                filters={filters}
                onFiltersChange={(f) => {
                  handleFiltersChange(f)
                }}
                activeFilterCount={activeFilterCount}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 px-4 lg:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border lg:block xl:w-72">
          <div className="sticky top-16 h-[calc(100vh-4rem)]">
            <FilterSidebar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              activeFilterCount={activeFilterCount}
            />
          </div>
        </aside>

        {/* Job listings */}
        <main className="flex-1 py-5 lg:pl-6">
          {/* Results header */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Showing{" "}
                <span className="font-bold">
                  {filteredJobs.length}
                </span>{" "}
                {filteredJobs.length === 1 ? "job" : "jobs"}
              </h2>
              {activeFilterLabels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    Filtered by:
                  </span>
                  {activeFilterLabels.slice(0, 4).map((label) => (
                    <Badge
                      key={label}
                      variant="secondary"
                      className="h-5 text-xs font-normal"
                    >
                      {label}
                    </Badge>
                  ))}
                  {activeFilterLabels.length > 4 && (
                    <Badge
                      variant="secondary"
                      className="h-5 text-xs font-normal"
                    >
                      +{activeFilterLabels.length - 4} more
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9 w-[180px] bg-card text-sm" aria-label="Sort jobs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="company">Company A-Z</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Job cards */}
          {isLoading ? (
            <div className="space-y-2" role="status" aria-label="Loading jobs">
              {Array.from({ length: 8 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
              <span className="sr-only">Loading job listings...</span>
            </div>
          ) : paginatedJobs.length > 0 ? (
            <>
              <div className="space-y-2">
                {paginatedJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <JobPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredJobs.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  onPageChange={setCurrentPage}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                No jobs found
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                No jobs match your current search and filter criteria. Try
                adjusting your filters or search terms.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  handleFiltersChange(defaultFilters)
                  setSearchQuery("")
                }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
