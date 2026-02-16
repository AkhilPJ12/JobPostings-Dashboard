import { render, screen } from '@/__tests__/utils/test-utils'
import { JobCard } from '@/components/job-card'
import { jobs } from '@/lib/job-data'

describe('JobCard', () => {
    const mockJob = jobs[0]

    it('should render job title', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.title)).toBeInTheDocument()
    })

    it('should render company name', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.company)).toBeInTheDocument()
    })

    it('should render location', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.location)).toBeInTheDocument()
    })

    it('should render location type badge', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.locationType)).toBeInTheDocument()
    })

    it('should render employment type', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.type)).toBeInTheDocument()
    })

    it('should render department', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.department)).toBeInTheDocument()
    })

    it('should have a link to job detail page', () => {
        render(<JobCard job={mockJob} />)
        const link = screen.getByRole('link')
        expect(link).toHaveAttribute('href', `/jobs/${mockJob.id}`)
    })

    it('should render job description', () => {
        render(<JobCard job={mockJob} />)
        expect(screen.getByText(mockJob.description)).toBeInTheDocument()
    })
})

describe('JobCardSkeleton', () => {
    it('should render skeleton loader', () => {
        const { JobCardSkeleton } = require('@/components/job-card')
        const { container } = render(<JobCardSkeleton />)
        expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    })
})
