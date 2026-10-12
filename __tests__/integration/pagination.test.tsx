import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils'
import { JobDashboard } from '@/components/job-dashboard'
import { createJob, dashboardJobs, uniqueCompanyCount } from '@/__tests__/utils/job-fixtures'

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
    const paginatedJobs = Array.from({ length: 45 }, (_, i) => createJob({
        id: String(i + 1),
        externalJobId: `pagination_${i + 1}`,
        title: `Test Job ${i + 1}`,
        company: `Company ${i % 3}`,
        department: i % 2 === 0 ? 'Engineering' : 'Product Management',
        description: 'Test pagination result',
        summary: 'Test pagination result',
    }))

    beforeEach(() => {
        sessionStorage.clear()
    })

    it('should navigate between pages', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        // Check for pagination by looking for next button
        const nextButton = screen.getByLabelText(/Go to next page/i)
        expect(nextButton).toBeInTheDocument()

        fireEvent.click(nextButton)

        await waitFor(() => {
            // Check that page 2 indicator exists
            const pageNumbers = screen.getAllByText('2')
            expect(pageNumbers.length).toBeGreaterThan(0)
        })
    })

    it('should reset to page 1 when searching', async () => {
        render(<JobDashboard initialJobs={paginatedJobs} initialCompanyCount={uniqueCompanyCount(paginatedJobs)} />)

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
        const searchInput = screen.getByLabelText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Test' } })

        await waitFor(() => {
            // Should be back on page 1
            expect(screen.getByRole('button', { name: /go to page 1/i })).toHaveAttribute('aria-current', 'page')
        }, { timeout: 1000 })
    })
})
