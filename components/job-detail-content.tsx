"use client"

import { useMemo } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
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
  ExternalLink,
  Hash,
  Info,
  FileText,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Job, formatDate } from "@/lib/job-data"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

function InfoCard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  variant?: "default" | "success" | "danger" | "neutral"
}) {
  const styles = {
    default: {
      card: "border-border/60 bg-card",
      value: "text-card-foreground",
      icon: "text-muted-foreground",
    },
    success: {
      card: "border-emerald-500/20 bg-emerald-500/5",
      value: "text-emerald-600 dark:text-emerald-400",
      icon: "text-emerald-500",
    },
    danger: {
      card: "border-red-500/20 bg-red-500/5",
      value: "text-red-600 dark:text-red-400",
      icon: "text-red-500",
    },
    neutral: {
      card: "border-border/60 bg-muted/30",
      value: "text-muted-foreground",
      icon: "text-muted-foreground",
    },
  }
  const s = styles[variant]
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-4", s.card)}>
      <div className={cn("flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider", s.icon)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className={cn("text-sm font-semibold", s.value)}>{value}</span>
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
    <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-foreground/60" />
      </div>
      {children}
    </h2>
  )
}

function clearanceVariant(val: string) {
  if (val === "Yes") return "success" as const
  if (val === "No") return "danger" as const
  return "neutral" as const
}

function getJobNumber(externalJobId: string): string {
  if (!externalJobId) return ""
  const parts = externalJobId.split("_")
  return parts.length > 1 ? parts.slice(1).join("_") : externalJobId
}

function parseDescriptionSections(description: string): {
  responsibilities: string
  otherInfo: string
} {
  if (!description) return { responsibilities: "", otherInfo: "" }
  const separator = "---OTHER_INFO---"
  const parts = description.split(separator)
  return {
    responsibilities: parts[0]?.trim() || "",
    otherInfo: parts[1]?.trim() || "",
  }
}

export function JobDetailContent({ job }: { job: Job }) {
  const router = useRouter()
  const jobNumber = getJobNumber(job.externalJobId)
  const { responsibilities, otherInfo } = useMemo(
    () => parseDescriptionSections(job.description),
    [job.description]
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass-strong">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back()
              } else {
                router.push("/")
              }
            }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Header card */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
          {/* Gradient banner */}
          <div className="h-24 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-purple-500/20 relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.2),transparent_60%)]" />
          </div>
          <div className="px-6 pb-6 -mt-10">
            {/* Company logo overlapping banner */}
            <div className="w-20 h-20 rounded-2xl bg-card border-4 border-card overflow-hidden shadow-lg mb-4">
              {job.companyIcon ? (
                <Image
                  src={job.companyIcon}
                  alt={job.company}
                  width={80}
                  height={80}
                  className="h-full w-full object-contain bg-white dark:bg-white/90 p-1.5"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
                  style={{ backgroundColor: job.companyColor }}
                  aria-hidden="true"
                >
                  {job.company.charAt(0)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {job.company}
                </span>
                {jobNumber && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
                    <Hash className="h-3 w-3" />
                    {jobNumber}
                  </span>
                )}
              </div>
              <h1 className="mt-1.5 text-xl font-bold leading-tight text-card-foreground sm:text-2xl text-balance">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 opacity-60" />
                  {job.location}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 opacity-60" />
                  {formatDate(job.postedDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 opacity-60" />
                  Ends: {formatDate(job.endDate)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {job.locationType && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-medium",
                      job.locationType === "Remote" &&
                        "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      job.locationType === "Hybrid" &&
                        "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      job.locationType === "Onsite" &&
                        "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                    )}
                  >
                    {job.locationType === "Remote" && (
                      <Globe className="mr-1 h-3 w-3" />
                    )}
                    {job.locationType}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  <Briefcase className="mr-1 h-3 w-3" />
                  {job.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {job.department}
                </Badge>
              </div>
            </div>

            <div className="mt-6">
              <Button
                asChild
                className="w-full sm:w-auto gap-2 rounded-xl transition-opacity hover:opacity-80"
                size="lg"
                disabled={!job.jobUrl}
              >
                <a
                  href={job.jobUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!job.jobUrl}
                >
                  Apply for this position
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Key Info */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon={Calendar} label="End Date" value={formatDate(job.endDate)} />
          <InfoCard icon={DollarSign} label="Pay Range" value={job.payRange} />
          <InfoCard icon={ShieldCheck} label="Security Clearance" value={job.securityClearance} variant={clearanceVariant(job.securityClearance)} />
          <InfoCard icon={Globe} label="Visa Sponsorship" value={job.visaSponsorship} variant={clearanceVariant(job.visaSponsorship)} />
        </div>

        {/* Content */}
        <div className="mt-8 space-y-5">
          {job.summary && (
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <SectionHeading icon={Briefcase}>Summary</SectionHeading>
              <p className="mt-4 leading-relaxed text-muted-foreground whitespace-pre-line">
                {job.summary}
              </p>
            </section>
          )}

          {responsibilities && (
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <SectionHeading icon={FileText}>About the Role</SectionHeading>
              <p className="mt-4 leading-relaxed text-muted-foreground whitespace-pre-line">
                {responsibilities}
              </p>
            </section>
          )}

          {(job.requiredQualifications.length > 0 || job.preferredQualifications.length > 0) && (
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <SectionHeading icon={CheckCircle2}>Qualifications</SectionHeading>

              {job.requiredQualifications.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Required
                  </h3>
                  <ul className="space-y-2.5">
                    {job.requiredQualifications.map((qual, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
                        <span className="leading-relaxed text-muted-foreground text-sm">
                          {qual}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {job.preferredQualifications.length > 0 && (
                <div className={job.requiredQualifications.length > 0 ? "mt-6 border-t border-border/40 pt-5" : "mt-4"}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Preferred
                  </h3>
                  <ul className="space-y-2.5">
                    {job.preferredQualifications.map((qual, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/50" />
                        <span className="leading-relaxed text-muted-foreground text-sm">
                          {qual}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {otherInfo && (
            <section className="rounded-2xl border border-border/60 bg-card p-6">
              <SectionHeading icon={Info}>Other Information</SectionHeading>
              <p className="mt-4 leading-relaxed text-muted-foreground whitespace-pre-line text-sm">
                {otherInfo}
              </p>
            </section>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 rounded-2xl border border-border/60 bg-muted/30 p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            Interested in this role?
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Apply directly on the company&apos;s careers page.
          </p>
          <Button
            asChild
            className="mt-5 gap-2 rounded-xl"
            size="lg"
            disabled={!job.jobUrl}
          >
            <a
              href={job.jobUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!job.jobUrl}
            >
              Apply for this position
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  )
}
