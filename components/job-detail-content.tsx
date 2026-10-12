"use client"

import { useMemo, type ComponentType, type ReactNode } from "react"
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
import { type Job, formatDate } from "@/lib/job-types"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

function InfoCard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: ComponentType<{ className?: string }>
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
    <div className={cn("flex flex-col gap-2 rounded-lg border p-4", s.card)}>
      <div className={cn("flex items-center gap-1.5 text-[11px] font-medium uppercase", s.icon)}>
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
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
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

function sanitizeText(text: string): string {
  if (!text) return ""
  let cleaned = text
    .replace(/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?\}/g, "")
    .replace(/window\.\w+[\w.]*\([^)]*\)/g, "")
    .replace(/document\.\w+[\w.]*\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")

  const lines = cleaned.split("\n")
  let startIdx = 0
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^(Full time|Part time|Contract|Internship|Temporary)$/i.test(line)) { startIdx = i + 1; continue }
    if (line.length < 60 && /,\s*(US|CA|TX|NY|WA|MA|IL|GA|CO|OR|PA|VA|MD|NC|OH|FL|AZ|NV|MN|MO|WI|TN|IN|MI|NJ|CT)\b/i.test(line)) { startIdx = i + 1; continue }
    break
  }
  if (startIdx > 0) cleaned = lines.slice(startIdx).join("\n")

  return cleaned
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function parseDescriptionSections(description: string): {
  responsibilities: string
  otherInfo: string
} {
  if (!description) return { responsibilities: "", otherInfo: "" }
  const separator = "---OTHER_INFO---"
  const parts = description.split(separator)
  return {
    responsibilities: sanitizeText(parts[0] || ""),
    otherInfo: sanitizeText(parts[1] || ""),
  }
}

function ApplyButton({ job, className }: { job: Job; className?: string }) {
  if (!job.jobUrl) {
    return (
      <Button className={cn("gap-2 rounded-lg", className)} size="lg" disabled>
        Apply unavailable
      </Button>
    )
  }

  return (
    <Button asChild className={cn("gap-2 rounded-lg", className)} size="lg">
      <a href={job.jobUrl} target="_blank" rel="noopener noreferrer">
        Apply for this position
        <ExternalLink className="h-4 w-4" />
      </a>
    </Button>
  )
}

function SummaryLine({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
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
      <header className="sticky top-0 z-40 glass-strong">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back()
              } else {
                router.push("/")
              }
            }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 lg:pb-10">
        <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card">
              {job.companyIcon ? (
                <Image
                  src={job.companyIcon}
                  alt={job.company}
                  width={64}
                  height={64}
                  className="h-full w-full object-contain bg-white p-1.5 dark:bg-white/90"
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-xl font-bold text-white"
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
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Hash className="h-3 w-3" />
                    {jobNumber}
                  </span>
                )}
              </div>
              <h1 className="mt-1.5 max-w-4xl text-2xl font-bold leading-tight text-card-foreground text-balance">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 opacity-60" />
                  {job.location}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 opacity-60" />
                  {formatDate(job.postedDate)}{job.dateProvenance === 'first_seen' ? ' (first seen)' : job.dateProvenance === 'legacy_unknown' ? ' (date unverified)' : ''}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 opacity-60" />
                  Ends: {formatDate(job.endDate)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
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
                  {job.locationType === "Remote" && <Globe className="mr-1 h-3 w-3" />}
                  {job.locationType}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Briefcase className="mr-1 h-3 w-3" />
                  {job.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {job.department}
                </Badge>
              </div>
            </div>

            <div className="hidden lg:block">
              <ApplyButton job={job} />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoCard icon={DollarSign} label="Pay Range" value={job.payRange} />
              <InfoCard icon={Globe} label="Visa Sponsorship" value={job.visaSponsorship} variant={clearanceVariant(job.visaSponsorship)} />
            </div>

            {job.summary && (
              <section className="rounded-lg border border-border/60 bg-card p-5">
                <SectionHeading icon={Briefcase}>{job.summaryGenerated ? 'AI summary' : 'Summary'}</SectionHeading>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {sanitizeText(job.summary)}
                </p>
              </section>
            )}

            {responsibilities && (
              <section className="rounded-lg border border-border/60 bg-card p-5">
                <SectionHeading icon={FileText}>About the Role</SectionHeading>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {responsibilities}
                </p>
              </section>
            )}

            {(job.requiredQualifications.length > 0 || job.preferredQualifications.length > 0) && (
              <section className="rounded-lg border border-border/60 bg-card p-5">
                <SectionHeading icon={CheckCircle2}>Qualifications</SectionHeading>

                {job.requiredQualifications.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground/70">
                      Required
                    </h3>
                    <ul className="space-y-2.5">
                      {job.requiredQualifications.map((qual, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground/40" />
                          <span className="text-sm leading-7 text-muted-foreground">
                            {qual}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {job.preferredQualifications.length > 0 && (
                  <div className={job.requiredQualifications.length > 0 ? "mt-6 border-t border-border/40 pt-5" : "mt-4"}>
                    <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground/70">
                      Preferred
                    </h3>
                    <ul className="space-y-2.5">
                      {job.preferredQualifications.map((qual, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/50" />
                          <span className="text-sm leading-7 text-muted-foreground">
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
              <section className="rounded-lg border border-border/60 bg-card p-5">
                <SectionHeading icon={Info}>Other Information</SectionHeading>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {otherInfo}
                </p>
              </section>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm">
              <ApplyButton job={job} className="w-full" />
              <SummaryLine icon={Building2} label="Company" value={job.company} />
              <SummaryLine icon={DollarSign} label="Pay Range" value={job.payRange} />
              <SummaryLine icon={Globe} label="Visa Sponsorship" value={job.visaSponsorship} />
              <SummaryLine icon={ShieldCheck} label="Security Clearance" value={job.securityClearance} />
              <SummaryLine icon={Calendar} label="End Date" value={formatDate(job.endDate)} />
              {jobNumber && <SummaryLine icon={Hash} label="Job ID" value={jobNumber} />}
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">
        <ApplyButton job={job} className="w-full" />
      </div>
    </div>
  )
}
