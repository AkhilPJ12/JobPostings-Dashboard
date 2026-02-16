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
    it('should render the dashboard header', () => {
        render(<JobDashboard />)
        expect(screen.getByText('Job Dashboard')).toBeInTheDocument()
    })

    it('should render search input', () => {
        render(<JobDashboard />)
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        expect(searchInput).toBeInTheDocument()
    })

    it('should render job listings after loading', async () => {
        render(<JobDashboard />)

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        // Check that jobs are rendered
        const jobCards = screen.getAllByRole('link')
        expect(jobCards.length).toBeGreaterThan(0)
    })

    it('should display total job count', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.getByText(/Showing/i)).toBeInTheDocument()
        })
    })

    it('should filter jobs when searching', async () => {
        render(<JobDashboard />)

        // Wait for initial load
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i)

        // Type in search
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        // Wait for debounce
        await waitFor(() => {
            expect(searchInput).toHaveValue('Engineer')
        }, { timeout: 500 })
    })

    it('should display theme toggle', () => {
        render(<JobDashboard />)
        const themeToggle = screen.getByRole('button', { name: /toggle theme/i })
        expect(themeToggle).toBeInTheDocument()
    })

    it('should display sort dropdown', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            const sortButton = screen.getByRole('combobox', { name: /sort jobs/i })
            expect(sortButton).toBeInTheDocument()
        })
    })

    it('should clear search when clicking clear button', async () => {
        render(<JobDashboard />)

        const searchInput = screen.getByPlaceholderText(/Search jobs/i) as HTMLInputElement

        // Type in search
        fireEvent.change(searchInput, { target: { value: 'Test' } })
        expect(searchInput.value).toBe('Test')

        // Click clear button
        const clearButton = screen.getByRole('button', { name: /clear search/i })
        fireEvent.click(clearButton)

        expect(searchInput.value).toBe('')
    })

    it('should show empty state when no jobs match filters', async () => {
        render(<JobDashboard />)

        // Wait for initial load
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i)

        // Search for something that doesn't exist
        fireEvent.change(searchInput, { target: { value: 'xyznonexistentjob123' } })

        // Wait for debounce and empty state
        await waitFor(() => {
            expect(screen.getByText(/No jobs found/i)).toBeInTheDocument()
        }, { timeout: 1000 })
    })
})
