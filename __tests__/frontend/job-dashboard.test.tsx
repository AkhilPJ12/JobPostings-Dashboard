import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils'
import { JobDashboard } from '@/components/job-dashboard'
import { dashboardJobs, uniqueCompanyCount } from '@/__tests__/utils/job-fixtures'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
    usePathname: () => '/',
}))

describe('JobDashboard', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('should render dashboard with key elements', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        expect(screen.getByText('Find Your Dream Job')).toBeInTheDocument()
        expect(screen.getByLabelText(/Search jobs/i)).toBeInTheDocument()

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })
    })

    it('should handle search input', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByLabelText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        expect(searchInput).toHaveValue('Engineer')
    })

    it('should show empty state for no results', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByLabelText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } })

        await waitFor(() => {
            expect(screen.getByText(/No jobs found/i)).toBeInTheDocument()
        }, { timeout: 1000 })
    })

    it('should toggle list view and persist view preference', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        const listButton = screen.getByRole('button', { name: /list view/i })
        fireEvent.click(listButton)

        expect(listButton).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => {
            expect(sessionStorage.getItem('job-dashboard-view')).toBe('"list"')
        })
    })

    it('should apply quick filters', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        const remoteFilter = screen.getByRole('button', { name: /^Remote$/i })
        fireEvent.click(remoteFilter)

        expect(remoteFilter).toHaveAttribute('aria-pressed', 'true')
    })
})
