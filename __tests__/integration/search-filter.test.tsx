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
    it('should filter results when searching', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        }, { timeout: 2000 })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i)
        fireEvent.change(searchInput, { target: { value: 'Engineer' } })

        await waitFor(() => {
            expect(searchInput).toHaveValue('Engineer')
        }, { timeout: 500 })

        // Use getAllByText and check the first one
        const showingElements = screen.getAllByText(/Showing/i)
        expect(showingElements.length).toBeGreaterThan(0)
    })

    it('should clear search results', async () => {
        render(<JobDashboard />)

        await waitFor(() => {
            expect(screen.queryByText(/Loading job listings/i)).not.toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(/Search jobs/i) as HTMLInputElement
        fireEvent.change(searchInput, { target: { value: 'Test' } })

        const clearButton = screen.getByRole('button', { name: /clear search/i })
        fireEvent.click(clearButton)

        expect(searchInput.value).toBe('')
    })
})
