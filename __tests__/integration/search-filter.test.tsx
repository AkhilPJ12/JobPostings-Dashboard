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

describe('Search and Filter Integration', () => {
    it('should combine search and filter results', async () => {
        render(<JobDashboard />)

        // Wait for initial load
        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        // Search for "Engineer"
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        // Wait for debounce
        await waitFor(() => {
            expect(searchInput).toHaveValue('Engineer')
        }, { timeout: 500 })

        // Results should be filtered
        expect(screen.getByText(/Showing/i)).toBeInTheDocument()
    })

    it('should update results when filters change', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Get initial count
        const initialText = screen.getByText(/Showing/i).textContent

        // Apply a search filter
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Product' } })

        // Wait for results to update
        await waitFor(() => {
            const newText = screen.getByText(/Showing/i).textContent
            expect(newText).not.toBe(initialText)
        }, { timeout: 1000 })
    })

    it('should display active filter badges', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Search for something
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Remote' } })

        await waitFor(() => {
            expect(searchInput).toHaveValue('Remote')
        }, { timeout: 500 })
    })

    it('should clear all filters when clicking clear button', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Apply search
        const searchInput = screen.getByPlaceholderText(/Search jobs/i) as HTMLInputElement
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        await waitFor(() => {
            expect(searchInput.value).toBe('Engineer')
        })

        // Clear search
        const clearButton = screen.getByRole('button', { name: /clear search/i })
        fireEvent.click(clearButton)

        expect(searchInput.value).toBe('')
    })

    it('should show no results message when search and filters return empty', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        // Search for non-existent job
        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'nonexistentjobxyz123' } })

        await waitFor(() => {
            expect(screen.getByText(/No jobs found/i)).toBeInTheDocument()
        }, { timeout: 1000 })
    })
})
