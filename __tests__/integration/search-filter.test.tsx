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

describe('Search and Filter Integration', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('should filter results when searching', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        const searchInput = screen.getByLabelText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        await waitFor(() => {
            expect(searchInput).toHaveValue('Engineer')
        }, { timeout: 500 })

        await waitFor(() => {
            expect(screen.getByText('Software Engineer 1')).toBeInTheDocument()
            expect(screen.queryByText('Product Manager 13')).not.toBeInTheDocument()
        }, { timeout: 1000 })
    })

    it('should clear search results', async () => {
        render(<JobDashboard initialJobs={dashboardJobs} initialCompanyCount={uniqueCompanyCount()} />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByLabelText(/Search jobs/i) as HTMLInputElement
        fireEvent.change(searchInput, { target: { value: 'Test' } })

        const clearButton = screen.getByRole('button', { name: /clear search/i })
        fireEvent.click(clearButton)

        expect(searchInput.value).toBe('')
    })
})
