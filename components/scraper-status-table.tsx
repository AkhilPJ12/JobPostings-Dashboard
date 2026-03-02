"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ScraperStatus } from "@/lib/job-data"

function formatLastScraped(date: Date | null): string {
  if (!date) return "Never"

  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hr ago`
  if (diffDays < 7) return `${diffDays} day ago${diffDays > 1 ? "s" : ""}`

  return date.toLocaleString()
}

function statusBadgeVariant(status: ScraperStatus["status"]) {
  if (status === "Successful") return "default" as const
  if (status === "Partial") return "secondary" as const
  return "destructive" as const
}

export function ScraperStatusTable({ statuses }: { statuses: ScraperStatus[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Last Scraped</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statuses.map((row) => (
            <TableRow key={row.companyName}>
              <TableCell className="font-medium">{row.companyName}</TableCell>
              <TableCell>{formatLastScraped(row.lastScrapedAt)}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(row.status)}>
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {row.durationSeconds == null ? "-" : `${row.durationSeconds}s`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

