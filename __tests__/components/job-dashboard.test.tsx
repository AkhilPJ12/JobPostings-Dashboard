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

describe('JobDashboard', () => {
    it('should render dashboard with key elements', async () => {
        render(<JobDashboard />)

        expect(screen.getByText('Job Dashboard')).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/Search jobs/i)).toBeInTheDocument()

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })
    })

    it('should handle search input', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        expect(searchInput).toHaveValue('Engineer')
    })

    it('should show empty state for no results', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'xyznonexistent123' } })

        await waitFor(() => {
            expect(screen.getByText(/No jobs found/i)).toBeInTheDocument()
        }, { timeout: 1000 })
    })
})
