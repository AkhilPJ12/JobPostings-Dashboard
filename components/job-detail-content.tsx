"use client"

import Link from "next/link"
import {
  ArrowLeft,
  MapPin,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  ShieldCheck,
  Globe,
  Briefcase,
  CheckCircle2,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { type Job, formatRelativeDate } from "@/lib/job-data"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

function InfoBadge({
  label,
  value,
}: {
  label: string
  value: "Yes" | "No" | "N/A"
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge
        variant="outline"
        className={cn(
          "px-2.5 py-0.5 text-xs font-semibold",
          value === "Yes" &&
            "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
          value === "No" &&
            "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400",
          value === "N/A" && "border-border bg-muted text-muted-foreground"
        )}
      >
        {value}
      </Badge>
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-semibold text-foreground">
      <Icon className="h-5 w-5 text-primary" />
      {children}
    </h2>
  )
}

export function JobDetailContent({ job }: { job: Job }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Header card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            {/* Company logo */}
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
              style={{ backgroundColor: job.companyColor, color: "white" }}
              aria-hidden="true"
            >
              {job.company.charAt(0)}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight text-card-foreground sm:text-2xl text-balance">
                {job.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {job.company}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                  {job.locationType !== "Onsite" &&
                    job.location !== "Remote" && (
                      <Badge variant="secondary" className="ml-0.5 text-[11px]">
                        {job.locationType}
                      </Badge>
                    )}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatRelativeDate(job.postedDate)}
                </span>
              </div>

              {/* Tags row */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  <Briefcase className="mr-1 h-3 w-3" />
                  {job.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {job.department}
                </Badge>
                {job.location === "Remote" && (
                  <Badge variant="secondary" className="text-xs">
                    <Globe className="mr-1 h-3 w-3" />
                    Remote
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="mt-5">
            <Button className="w-full sm:w-auto">Apply for this position</Button>
          </div>
        </div>

        {/* Key Info Grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              <DollarSign className="mr-1 inline h-4 w-4" />
              Pay Range
            </span>
            <span className="text-sm font-semibold text-card-foreground">
              {job.payRange}
            </span>
          </div>
          <InfoBadge label="Security Clearance" value={job.securityClearance} />
          <InfoBadge label="H1B Sponsorship" value={job.h1bSponsorship} />
        </div>

        {/* Content sections */}
        <div className="mt-8 space-y-8">
          {/* Summary */}
          <section>
            <SectionHeading icon={Briefcase}>Summary</SectionHeading>
            <Separator className="my-3" />
            <p className="leading-relaxed text-muted-foreground">
              {job.summary}
            </p>
          </section>

          {/* Description */}
          <section>
            <SectionHeading icon={Clock}>About the Role</SectionHeading>
            <Separator className="my-3" />
            <p className="leading-relaxed text-muted-foreground">
              {job.description}
            </p>
          </section>

          {/* Required Qualifications */}
          <section>
            <SectionHeading icon={CheckCircle2}>
              Required Qualifications
            </SectionHeading>
            <Separator className="my-3" />
            <ul className="space-y-2.5">
              {job.requiredQualifications.map((qual, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="leading-relaxed text-muted-foreground">
                    {qual}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Preferred Qualifications */}
          <section>
            <SectionHeading icon={Star}>
              Preferred Qualifications
            </SectionHeading>
            <Separator className="my-3" />
            <ul className="space-y-2.5">
              {job.preferredQualifications.map((qual, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="leading-relaxed text-muted-foreground">
                    {qual}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 rounded-xl border border-border bg-card p-6 text-center">
          <h3 className="text-lg font-semibold text-card-foreground">
            Interested in this role?
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Submit your application and our team will review it shortly.
          </p>
          <Button className="mt-4" size="lg">
            Apply for this position
          </Button>
        </div>
      </main>
    </div>
  )
}
