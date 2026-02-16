import { render, screen } from '@/__tests__/utils/test-utils'
import { JobCard } from '@/components/job-card'
import { jobs } from '@/lib/job-data'

describe('JobCard', () => {
    const mockJob = jobs[0]

    it('should render essential job information', () => {
        render(<JobCard job={mockJob} />)

        // Verify key information is displayed
        expect(screen.getByText(mockJob.title)).toBeInTheDocument()
        expect(screen.getByText(mockJob.company)).toBeInTheDocument()
        expect(screen.getByText(mockJob.location)).toBeInTheDocument()
    })

    it('should link to job detail page', () => {
        render(<JobCard job={mockJob} />)
        const link = screen.getByRole('link')
        expect(link).toHaveAttribute('href', `/jobs/${mockJob.id}`)
    })
})
