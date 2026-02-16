"use client"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { cn } from "@/lib/utils"

type JobPaginationProps = {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}

export function JobPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: JobPaginationProps) {
  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = []

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push("ellipsis")
      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i++
      ) {
        pages.push(i)
      }
      if (currentPage < totalPages - 2) pages.push("ellipsis")
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground">{startItem}</span>
        {"-"}
        <span className="font-medium text-foreground">{endItem}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span> jobs
      </p>

      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={(e) => {
                e.preventDefault()
                if (currentPage > 1) onPageChange(currentPage - 1)
              }}
              className={cn(
                "cursor-pointer select-none",
                currentPage === 1 && "pointer-events-none opacity-50"
              )}
              aria-disabled={currentPage === 1}
            />
          </PaginationItem>

          {getPageNumbers().map((page, idx) =>
            page === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={(e) => {
                    e.preventDefault()
                    onPageChange(page)
                  }}
                  isActive={page === currentPage}
                  className={cn(
                    "cursor-pointer select-none",
                    page === currentPage &&
                      "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-primary"
                  )}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationNext
              onClick={(e) => {
                e.preventDefault()
                if (currentPage < totalPages) onPageChange(currentPage + 1)
              }}
              className={cn(
                "cursor-pointer select-none",
                currentPage === totalPages && "pointer-events-none opacity-50"
              )}
              aria-disabled={currentPage === totalPages}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
