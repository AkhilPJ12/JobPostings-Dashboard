"use client"

import { useState, useMemo } from "react"
import { Search, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
}

const DEFAULT_COMPANY_COUNT = 5

export function FilterSidebar({
  filters,
  onFiltersChange,
  activeFilterCount,
}: FilterSidebarProps) {
  const [companySearch, setCompanySearch] = useState("")
  const [showAllCompanies, setShowAllCompanies] = useState(false)

  const companies = useMemo(() => getUniqueCompanies(), [])
  const departments = useMemo(() => getUniqueDepartments(), [])

  const filteredCompanies = useMemo(
    () =>
      companySearch
        ? companies.filter((c) =>
            c.toLowerCase().includes(companySearch.toLowerCase())
          )
        : companies,
    [companies, companySearch]
  )

  const visibleCompanies = useMemo(() => {
    if (companySearch || showAllCompanies) return filteredCompanies
    return filteredCompanies.slice(0, DEFAULT_COMPANY_COUNT)
  }, [filteredCompanies, showAllCompanies, companySearch])

  const hasMoreCompanies = !companySearch && filteredCompanies.length > DEFAULT_COMPANY_COUNT

  const toggleArrayFilter = (
    key: "companies" | "locationTypes" | "departments" | "employmentTypes",
    value: string
  ) => {
    const current = filters[key]
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onFiltersChange({ ...filters, [key]: updated })
  }

  const selectAllCompanies = () => {
    const allSelected = companies.every((c) => filters.companies.includes(c))
    onFiltersChange({
      ...filters,
      companies: allSelected ? [] : [...companies],
    })
  }

  const clearAll = () => {
    onFiltersChange({
      companies: [],
      locationTypes: [],
      departments: [],
      datePosted: "all",
      employmentTypes: [],
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Filters</h2>
          {activeFilterCount > 0 && (
            <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-5">
          {/* Companies */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company
            </h3>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="h-8 bg-muted/50 pl-8 text-xs"
              />
              {companySearch && (
                <button
                  onClick={() => setCompanySearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear company search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={selectAllCompanies}
              className="mb-2 text-xs font-medium text-primary hover:underline"
            >
              {companies.every((c) => filters.companies.includes(c))
                ? "Deselect All"
                : "Select All"}
            </button>
            <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
              {visibleCompanies.map((company) => (
                <label
                  key={company}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={filters.companies.includes(company)}
                    onCheckedChange={() =>
                      toggleArrayFilter("companies", company)
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1 truncate text-foreground">{company}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {getJobCountByCompany(company)}
                  </span>
                </label>
              ))}
            </div>
            {hasMoreCompanies && (
              <button
                onClick={() => setShowAllCompanies(!showAllCompanies)}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                {showAllCompanies
                  ? "Show less"
                  : `Show all (${filteredCompanies.length})`}
              </button>
            )}
          </section>

          {/* Location Type */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Location Type
            </h3>
            <div className="space-y-1.5">
              {["Remote", "Hybrid", "Onsite"].map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={filters.locationTypes.includes(type)}
                    onCheckedChange={() =>
                      toggleArrayFilter("locationTypes", type)
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">{type}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Department */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Department
            </h3>
            <div className="space-y-1.5">
              {departments.map((dept) => (
                <label
                  key={dept}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={filters.departments.includes(dept)}
                    onCheckedChange={() =>
                      toggleArrayFilter("departments", dept)
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">{dept}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Date Posted */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Date Posted
            </h3>
            <RadioGroup
              value={filters.datePosted}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, datePosted: value })
              }
              className="space-y-1.5"
            >
              {[
                { value: "today", label: "Today" },
                { value: "7days", label: "Last 7 days" },
                { value: "30days", label: "Last 30 days" },
                { value: "all", label: "All time" },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`date-${option.value}`}
                    className="h-3.5 w-3.5"
                  />
                  <Label
                    htmlFor={`date-${option.value}`}
                    className="cursor-pointer font-normal text-foreground"
                  >
                    {option.label}
                  </Label>
                </label>
              ))}
            </RadioGroup>
          </section>

          {/* Employment Type */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Employment Type
            </h3>
            <div className="space-y-1.5">
              {["Full-time", "Part-time", "Contract", "Internship"].map(
                (type) => (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={filters.employmentTypes.includes(type)}
                      onCheckedChange={() =>
                        toggleArrayFilter("employmentTypes", type)
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-foreground">{type}</span>
                  </label>
                )
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
