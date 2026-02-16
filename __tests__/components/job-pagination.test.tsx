import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { JobPagination } from '@/components/job-pagination'

describe('JobPagination', () => {
    const mockOnPageChange = jest.fn()

    beforeEach(() => {
        mockOnPageChange.mockClear()
    })

    it('should render current page and total pages', () => {
        render(
            <JobPagination
                currentPage={1}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        expect(screen.getByText(/Page 1 of 5/i)).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
        render(
            <JobPagination
                currentPage={1}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        const prevButton = screen.getByRole('button', { name: /previous/i })
        expect(prevButton).toBeDisabled()
    })

    it('should disable next button on last page', () => {
        render(
            <JobPagination
                currentPage={5}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        const nextButton = screen.getByRole('button', { name: /next/i })
        expect(nextButton).toBeDisabled()
    })

    it('should call onPageChange when clicking next button', () => {
        render(
            <JobPagination
                currentPage={2}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        const nextButton = screen.getByRole('button', { name: /next/i })
        fireEvent.click(nextButton)
        expect(mockOnPageChange).toHaveBeenCalledWith(3)
    })

    it('should call onPageChange when clicking previous button', () => {
        render(
            <JobPagination
                currentPage={3}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        const prevButton = screen.getByRole('button', { name: /previous/i })
        fireEvent.click(prevButton)
        expect(mockOnPageChange).toHaveBeenCalledWith(2)
    })

    it('should display correct item range', () => {
        render(
            <JobPagination
                currentPage={2}
                totalPages={5}
                totalItems={50}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        expect(screen.getByText(/11-20 of 50/i)).toBeInTheDocument()
    })

    it('should handle last page with fewer items', () => {
        render(
            <JobPagination
                currentPage={3}
                totalPages={3}
                totalItems={25}
                itemsPerPage={10}
                onPageChange={mockOnPageChange}
            />
        )
        expect(screen.getByText(/21-25 of 25/i)).toBeInTheDocument()
    })
})
