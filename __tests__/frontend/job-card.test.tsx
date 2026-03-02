import { render, screen } from '@/__tests__/utils/test-utils'
import { JobCard } from '@/components/job-card'
import { type Job } from '@/lib/job-data'

const mockJob: Job = {
    id: '1',
    title: 'Senior Frontend Engineer',
    company: 'Vercel',
    companyColor: 'hsl(0, 0%, 10%)',
    location: 'Remote',
    locationType: 'Remote',
    department: 'Engineering',
    type: 'Full-time',
    postedDate: new Date(),
    description: 'Join our engineering team to build scalable, performant systems.',
    securityClearance: 'No',
    h1bSponsorship: 'Yes',
    jobUrl: 'https://example.com/jobs/1',
    summary: 'We are seeking a talented engineer.',
    requiredQualifications: ['3+ years experience', 'TypeScript proficiency'],
    preferredQualifications: ['Next.js experience'],
    payRange: '$150,000 - $210,000',
}

describe('JobCard', () => {
    it('should render essential job information', () => {
        render(<JobCard job={mockJob} />)

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
