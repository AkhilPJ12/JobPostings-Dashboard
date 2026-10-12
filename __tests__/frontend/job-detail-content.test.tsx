import { render, screen } from '@/__tests__/utils/test-utils'
import { JobDetailContent } from '@/components/job-detail-content'
import { createJob } from '@/__tests__/utils/job-fixtures'

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        back: jest.fn(),
        push: jest.fn(),
    }),
}))

describe('JobDetailContent', () => {
    it('renders sticky summary details and apply links', () => {
        const job = createJob({
            title: 'Platform Engineer',
            company: 'Acme',
            payRange: '$140,000 - $190,000',
            visaSponsorship: 'Yes',
            securityClearance: 'No',
            endDate: '2026-07-01',
        })

        render(<JobDetailContent job={job} />)

        expect(screen.getByText('Platform Engineer')).toBeInTheDocument()
        expect(screen.getAllByText('$140,000 - $190,000').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Visa Sponsorship').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Security Clearance').length).toBeGreaterThan(0)
        expect(screen.getAllByRole('link', { name: /Apply for this position/i })[0]).toHaveAttribute('href', job.jobUrl)
    })

    it('shows disabled apply state when job URL is unavailable', () => {
        const job = createJob({ jobUrl: '' })

        render(<JobDetailContent job={job} />)

        expect(screen.getAllByRole('button', { name: /Apply unavailable/i }).length).toBeGreaterThan(0)
    })
})
