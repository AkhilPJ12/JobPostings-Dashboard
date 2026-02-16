import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { JobPagination } from '@/components/job-pagination'

describe('JobPagination', () => {
    const mockOnPageChange = jest.fn()

    beforeEach(() => {
        mockOnPageChange.mockClear()
    })

    it('should display pagination information', () => {
        render(
            <JobPagination
                currentPage={1}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )

        // Check for "Showing" text which indicates pagination is rendered
        expect(screen.getByText(/Showing/i)).toBeInTheDocument()
        // Check for total items
        expect(screen.getByText(/50/)).toBeInTheDocument()
    })

    it('should handle page navigation', () => {
        render(
            <JobPagination
                currentPage={2}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )

        const nextButton = screen.getByLabelText(/Go to next page/i)
        fireEvent.click(nextButton)
        expect(mockOnPageChange).toHaveBeenCalledWith(3)
    })

    it('should disable navigation at boundaries', () => {
        render(
            <JobPagination
                currentPage={1}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )

        const prevButton = screen.getByLabelText(/Go to previous page/i)
        expect(prevButton).toHaveAttribute('aria-disabled', 'true')
    })
})
