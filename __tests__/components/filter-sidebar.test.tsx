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

    it('should render all filter sections', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        expect(screen.getByText(/Companies/i)).toBeInTheDocument()
        expect(screen.getByText(/Location Type/i)).toBeInTheDocument()
        expect(screen.getByText(/Department/i)).toBeInTheDocument()
        expect(screen.getByText(/Date Posted/i)).toBeInTheDocument()
        expect(screen.getByText(/Employment Type/i)).toBeInTheDocument()
    })

    it('should display active filter count', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={3}
            />
        )

        expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('should show clear filters button when filters are active', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={2}
            />
        )

        expect(screen.getByText(/Clear filters/i)).toBeInTheDocument()
    })

    it('should call onFiltersChange when clearing filters', () => {
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

        const clearButton = screen.getByText(/Clear filters/i)
        fireEvent.click(clearButton)

        expect(mockOnFiltersChange).toHaveBeenCalledWith(defaultFilters)
    })

    it('should render company checkboxes', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        // Check for some common companies
        expect(screen.getByLabelText(/Vercel/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Stripe/i)).toBeInTheDocument()
    })

    it('should render location type checkboxes', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        expect(screen.getByLabelText(/Remote/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Hybrid/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Onsite/i)).toBeInTheDocument()
    })

    it('should render department checkboxes', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        expect(screen.getByLabelText(/Engineering/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Product/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Design/i)).toBeInTheDocument()
    })

    it('should render employment type checkboxes', () => {
        render(
            <FilterSidebar
                filters={defaultFilters}
                onFiltersChange={mockOnFiltersChange}
                activeFilterCount={0}
            />
        )

        expect(screen.getByLabelText(/Full-time/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Part-time/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Contract/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Internship/i)).toBeInTheDocument()
    })
})
