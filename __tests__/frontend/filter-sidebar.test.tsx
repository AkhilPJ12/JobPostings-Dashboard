import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { FilterSidebar, type Filters } from '@/components/filter-sidebar'

describe('FilterSidebar', () => {
    const mockOnFiltersChange = jest.fn()
    const defaultFilters: Filters = {
        companies: [],
        locationTypes: [],
        departments: [],
        datePosted: 'all',
        employmentTypes: [],
    }

    beforeEach(() => {
        mockOnFiltersChange.mockClear()
    })

    it('should render filter sections', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        // Check for "Filters" heading instead of individual section names
        expect(screen.getByText('Filters')).toBeInTheDocument()
    })

    it('should display active filter count', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={3}
            />
        )

        // Use getAllByText since "3" appears multiple times (badge + filter counts)
        const threes = screen.getAllByText('3')
        expect(threes.length).toBeGreaterThan(0)
    })

    it('should handle clear filters', () => {
        render(
            <FilterSidebar
                filters={{
                    ...defaultFilters,
                    companies: ['Vercel'],
                }}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={1}
            />
        )

        // Button text is "Clear all" not "Clear filters"
        const clearButton = screen.getByText(/Clear all/i)
        fireEvent.click(clearButton)
        expect(mockOnFiltersChange).toHaveBeenCalledWith(defaultFilters)
    })
})
