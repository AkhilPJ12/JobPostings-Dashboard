"use client"

import { useState, useEffect } from "react"
import { Search, X, SlidersHorizontal, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  getUniqueCompanies,
  getUniqueDepartments,
  getJobCountByCompany,
} from "@/lib/job-data"

export type Filters = {
  companies: string[]
  locationTypes: string[]
  departments: string[]
  datePosted: string
  employmentTypes: string[]
}

type FilterSidebarProps = {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
  activeFilterCount: number
  isOpen: boolean
  onClose: () => void
}

const workTypeConfig: Record<string, { dot: string; text: string; selectedBorder: string; selectedBg: string }> = {
  Remote: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  Hybrid: {
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    selectedBorder: "border-sky-500",
    selectedBg: "bg-sky-50 dark:bg-sky-950/40",
  },
  Onsite: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    selectedBorder: "border-amber-500",
    selectedBg: "bg-amber-50 dark:bg-amber-950/40",
  },
}

export function FilterSidebar({
  filters,
  onFiltersChange,
  activeFilterCount,
  isOpen,
  onClose,
}: FilterSidebarProps) {
  const [localFilters, setLocalFilters] = useState<Filters>(filters)
  const [companySearch, setCompanySearch] = useState("")
  const [visible, setVisible] = useState(false)
  const [companies, setCompanies] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      setLocalFilters(filters)
    } else {
      const timer = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen, filters])

  useEffect(() => {
    async function fetchFilterData() {
      try {
        const [fetchedCompanies, fetchedDepartments] = await Promise.all([
          getUniqueCompanies(),
          getUniqueDepartments(),
        ])
        setCompanies(fetchedCompanies)
        setDepartments(fetchedDepartments)
        const counts: Record<string, number> = {}
        for (const company of fetchedCompanies) {
          counts[company] = await getJobCountByCompany(company)
        }
        setCompanyCounts(counts)
      } catch (error) {
        console.error('Error fetching filter data:', error)
      }
    }
    fetchFilterData()
  }, [])

  if (!visible && !isOpen) return null

  const filteredCompanies = companySearch
    ? companies.filter(c => c.toLowerCase().includes(companySearch.toLowerCase()))
    : companies

  const toggleCompany = (company: string) => {
    const updated = localFilters.companies.includes(company)
      ? localFilters.companies.filter(c => c !== company)
      : [...localFilters.companies, company]
    setLocalFilters({ ...localFilters, companies: updated })
  }

  const toggleLocationType = (type: string) => {
    const updated = localFilters.locationTypes.includes(type)
      ? localFilters.locationTypes.filter(t => t !== type)
      : [...localFilters.locationTypes, type]
    setLocalFilters({ ...localFilters, locationTypes: updated })
  }

  const toggleDepartment = (dept: string) => {
    const updated = localFilters.departments.includes(dept)
      ? localFilters.departments.filter(d => d !== dept)
      : [...localFilters.departments, dept]
    setLocalFilters({ ...localFilters, departments: updated })
  }

  const toggleEmploymentType = (type: string) => {
    const updated = localFilters.employmentTypes.includes(type)
      ? localFilters.employmentTypes.filter(t => t !== type)
      : [...localFilters.employmentTypes, type]
    setLocalFilters({ ...localFilters, employmentTypes: updated })
  }

  const handleApply = () => {
    onFiltersChange(localFilters)
    onClose()
  }

  const handleReset = () => {
    const reset: Filters = {
      companies: [],
      locationTypes: [],
      departments: [],
      datePosted: "all",
      employmentTypes: [],
    }
    setLocalFilters(reset)
    onFiltersChange(reset)
  }

  const localActiveCount =
    localFilters.companies.length +
    localFilters.locationTypes.length +
    localFilters.departments.length +
    localFilters.employmentTypes.length +
    (localFilters.datePosted !== "all" ? 1 : 0)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-40 cursor-pointer"
        style={{ opacity: isOpen ? 1 : 0, transition: "opacity 0.3s ease" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Filters</h3>
              {localActiveCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {localActiveCount} active filter{localActiveCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {localActiveCount > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          {/* Company */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Company</label>
              <button
                onClick={() => {
                  const allSelected = companies.every(c => localFilters.companies.includes(c))
                  setLocalFilters({ ...localFilters, companies: allSelected ? [] : [...companies] })
                }}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {companies.every(c => localFilters.companies.includes(c)) ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={companySearch}
                onChange={e => setCompanySearch(e.target.value)}
                className="pl-9 bg-muted/60 border-border/50 rounded-xl h-10"
              />
              {companySearch && (
                <button
                  onClick={() => setCompanySearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredCompanies.map(company => (
                <label
                  key={company}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/60 p-2.5 rounded-xl transition-colors group"
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    localFilters.companies.includes(company)
                      ? "bg-primary border-primary"
                      : "border-border/60 group-hover:border-primary/40"
                  }`}>
                    {localFilters.companies.includes(company) && (
                      <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input type="checkbox" checked={localFilters.companies.includes(company)} onChange={() => toggleCompany(company)} className="hidden" />
                  <span className="flex-1 text-sm text-foreground/80">{company}</span>
                  <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {companyCounts[company] || 0}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Work Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Work Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Remote", "Hybrid", "Onsite"] as const).map(type => {
                const config = workTypeConfig[type]
                const isSelected = localFilters.locationTypes.includes(type)
                return (
                  <button
                    key={type}
                    onClick={() => toggleLocationType(type)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                      isSelected
                        ? `${config.selectedBorder} ${config.selectedBg}`
                        : "border-border/50 hover:border-primary/30 hover:bg-muted/40"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                    <span className={`text-[13px] font-medium ${isSelected ? config.text : "text-foreground"}`}>{type}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Department */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Department</label>
            <div className="flex flex-wrap gap-2">
              {departments.map(dept => {
                const isSelected = localFilters.departments.includes(dept)
                return (
                  <button
                    key={dept}
                    onClick={() => toggleDepartment(dept)}
                    className={`px-3 py-1.5 rounded-full border text-[13px] transition-all duration-200 ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm font-semibold"
                        : "bg-muted/50 text-muted-foreground border-border/50 hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {dept}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date Posted */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Date Posted</label>
            <div className="space-y-1.5">
              {[
                { value: "today", label: "Today" },
                { value: "7days", label: "Last 7 days" },
                { value: "30days", label: "Last 30 days" },
                { value: "all", label: "All time" },
              ].map(option => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/60 p-2.5 rounded-xl transition-colors group"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    localFilters.datePosted === option.value ? "border-primary" : "border-border/60 group-hover:border-primary/40"
                  }`}>
                    {localFilters.datePosted === option.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <input
                    type="radio"
                    name="datePosted"
                    checked={localFilters.datePosted === option.value}
                    onChange={() => setLocalFilters({ ...localFilters, datePosted: option.value })}
                    className="hidden"
                  />
                  <span className={`text-sm ${localFilters.datePosted === option.value ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Employment Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Employment Type</label>
            <div className="space-y-1.5">
              {["Full-time", "Part-time", "Contract", "Internship"].map(type => (
                <label
                  key={type}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/60 p-2.5 rounded-xl transition-colors group"
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    localFilters.employmentTypes.includes(type)
                      ? "bg-primary border-primary"
                      : "border-border/60 group-hover:border-primary/40"
                  }`}>
                    {localFilters.employmentTypes.includes(type) && (
                      <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input type="checkbox" checked={localFilters.employmentTypes.includes(type)} onChange={() => toggleEmploymentType(type)} className="hidden" />
                  <span className={`text-sm ${localFilters.employmentTypes.includes(type) ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border/60 bg-card">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-border/60 rounded-xl hover:bg-muted transition-colors text-foreground text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl hover:from-indigo-600 hover:to-violet-600 transition-all duration-200 shadow-lg shadow-indigo-500/20 text-sm font-medium"
            >
              Apply{localActiveCount > 0 ? ` (${localActiveCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
