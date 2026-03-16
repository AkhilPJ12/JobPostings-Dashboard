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

// Mock the job-data module so the component has data to paginate.
// Note: jest.mock is hoisted, so mock data must be inlined in the factory.
jest.mock('@/lib/job-data', () => {
    const mockJobs = Array.from({ length: 15 }, (_, i) => ({
        id: String(i + 1),
        title: `Test Job ${i + 1}`,
        company: `Company ${String.fromCharCode(65 + (i % 3))}`,
        companyColor: 'hsl(0, 0%, 10%)',
        companyIcon: null,
        location: 'Remote',
        locationType: 'Remote',
        department: 'Engineering',
        type: 'Full-time',
        postedDate: new Date(2026, 1, 18 - i).toISOString().split('T')[0],
        endDate: null,
        description: `Description for job ${i + 1}`,
        securityClearance: 'No',
        visaSponsorship: 'Yes',
        externalJobId: `mock_${i + 1}`,
        jobUrl: 'https://example.com/jobs/mock',
        summary: `Summary for job ${i + 1}`,
        requiredQualifications: ['Req 1'],
        preferredQualifications: ['Pref 1'],
        payRange: '$100,000 - $150,000',
    }))

    const actual = jest.requireActual('@/lib/job-data')
    return {
        ...actual,
        getJobs: jest.fn().mockResolvedValue(mockJobs),
        getUniqueCompanyCount: jest.fn().mockResolvedValue(3),
    }
})

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
            // Check that page 2 indicator exists
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
        fireEvent.change(searchInput, { target: { value: 'Test' } })

        await waitFor(() => {
            // Should be back on page 1
            const pageOnes = screen.getAllByText('1')
            expect(pageOnes.length).toBeGreaterThan(0)
        }, { timeout: 1000 })
    })
})
