import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils'
import { JobDashboard } from '@/components/job-dashboard'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
    usePathname: () => '/',
}))

describe('Pagination Integration', () => {
    it('should display pagination controls', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        // Check for pagination
        expect(screen.getByText(/Page/i)).toBeInTheDocument()
    })

    it('should navigate to next page', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const nextButton = screen.getByRole('button', { name: /next/i })
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/Page 2/i)).toBeInTheDocument()
        })
    })

    it('should navigate to previous page', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Go to page 2 first
        const nextButton = screen.getByRole('button', { name: /next/i })
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/Page 2/i)).toBeInTheDocument()
        })

        // Go back to page 1
        const prevButton = screen.getByRole('button', { name: /previous/i })
        fireEvent.click(prevButton)

        await waitFor(() => {
            expect(screen.getByText(/Page 1/i)).toBeInTheDocument()
        })
    })

    it('should reset to page 1 when filters change', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Go to page 2
        const nextButton = screen.getByRole('button', { name: /next/i })
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/Page 2/i)).toBeInTheDocument()
        })

        // Apply a search filter
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        // Should reset to page 1
        await waitFor(() => {
            expect(screen.getByText(/Page 1/i)).toBeInTheDocument()
        }, { timeout: 1000 })
    })
})
