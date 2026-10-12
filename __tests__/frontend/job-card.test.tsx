import { render, screen } from '@/__tests__/utils/test-utils'
import { JobCard } from '@/components/job-card'
import { type Job } from '@/lib/job-types'

const mockJob: Job = {
    id: '1',
    title: 'Senior Frontend Engineer',
    company: 'Vercel',
    companyColor: 'hsl(0, 0%, 10%)',
    companyIcon: null,
    location: 'San Francisco, CA',
    locationType: 'Onsite',
    department: 'Engineering',
    type: 'Full-time',
    postedDate: new Date().toISOString().split('T')[0],
    endDate: null,
    description: 'Join our engineering team to build scalable, performant systems.',
    securityClearance: 'No',
    visaSponsorship: 'Yes',
    externalJobId: 'mock_1',
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
        const link = screen.getByLabelText(/View details for/i)
        expect(link).toHaveAttribute('href', `/jobs/${mockJob.id}`)
    })

    it('should expose a direct apply link', () => {
        render(<JobCard job={mockJob} />)
        const applyLink = screen.getByLabelText(/Apply for/i)
        expect(applyLink).toHaveAttribute('href', mockJob.jobUrl)
        expect(applyLink).toHaveAttribute('target', '_blank')
    })
})
