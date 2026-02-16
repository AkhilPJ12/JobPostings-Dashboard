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
    it('should navigate between pages', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        // Check for pagination by looking for next button
        const nextButton = screen.getByLabelText(/Go to next page/i)
        expect(nextButton).toBeInTheDocument()

        fireEvent.click(nextButton)

        await waitFor(() => {
            // Check that page 2 indicator exists (the number "2")
            const pageNumbers = screen.getAllByText('2')
            expect(pageNumbers.length).toBeGreaterThan(0)
        })
    })

    it('should reset to page 1 when searching', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Go to page 2
        const nextButton = screen.getByLabelText(/Go to next page/i)
        fireEvent.click(nextButton)

        await waitFor(() => {
            const pageNumbers = screen.getAllByText('2')
            expect(pageNumbers.length).toBeGreaterThan(0)
        })

        // Search should reset to page 1
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        await waitFor(() => {
            // Should be back on page 1
            const pageOnes = screen.getAllByText('1')
            expect(pageOnes.length).toBeGreaterThan(0)
        }, { timeout: 1000 })
    })
})
