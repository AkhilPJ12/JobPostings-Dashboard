import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { FilterSidebar, type Filters } from '@/components/filter-sidebar'
import { dashboardJobs } from '@/__tests__/utils/job-fixtures'

describe('FilterSidebar', () => {
    const mockOnFiltersChange = jest.fn()
    const defaultFilters: Filters = {
        companies: [],
        locationTypes: [],
        departments: [],
        datePosted: 'all',
        employmentTypes: [],
        visaSponsorship: [],
        securityClearance: [],
    }

    beforeEach(() => {
        mockOnFiltersChange.mockClear()
    })

    const renderSidebar = (filters: Filters = defaultFilters) => render(
        <FilterSidebar
            filters={filters}
            onFiltersChange={mockOnFiltersChange}
            isOpen
            onClose={jest.fn()}
            jobs={dashboardJobs}
            resultCount={dashboardJobs.length}
        />
    )

    it('should render filter sections', () => {
        renderSidebar()

        // Check for "Filters" heading instead of individual section names
        expect(screen.getByText('Filters')).toBeInTheDocument()
        expect(screen.getByText('Visa Sponsorship')).toBeInTheDocument()
        expect(screen.getByText('Security Clearance')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Apply \(/i })).toBeInTheDocument()
    })

    it('should display active filter count', () => {
        renderSidebar({
            ...defaultFilters,
            companies: ['Vercel'],
            departments: ['Engineering'],
            employmentTypes: ['Full-time'],
            visaSponsorship: ['Yes'],
            securityClearance: ['Yes'],
        })

        expect(screen.getByText('5 active filters')).toBeInTheDocument()
    })

    it('should handle clear filters', () => {
        renderSidebar({
            ...defaultFilters,
            companies: ['Vercel'],
        })

        const clearButton = screen.getByText(/Reset/i)
        fireEvent.click(clearButton)
        expect(mockOnFiltersChange).toHaveBeenCalledWith(defaultFilters)
    })
})
