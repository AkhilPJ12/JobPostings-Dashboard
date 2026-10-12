import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { ScraperStatusTable } from '@/components/scraper-status-table'
import type { ScraperStatus } from '@/lib/job-types'

const statuses: ScraperStatus[] = [
    {
        companyName: 'Amazon',
        companyIcon: null,
        status: 'Successful',
        lastScrapedAt: new Date('2026-06-14T10:00:00Z'),
        durationSeconds: 45,
        errorMessage: null,
        totalJobs: 120,
    },
    {
        companyName: 'Google',
        companyIcon: null,
        status: 'Successful',
        lastScrapedAt: new Date('2026-06-14T09:00:00Z'),
        durationSeconds: 30,
        errorMessage: null,
        totalJobs: 0,
    },
    {
        companyName: 'Meta',
        companyIcon: null,
        status: 'Error',
        lastScrapedAt: new Date('2026-06-14T08:00:00Z'),
        durationSeconds: 60,
        errorMessage: 'Timeout',
        totalJobs: 80,
    },
]

describe('ScraperStatusTable', () => {
    it('filters scraper rows by company search', () => {
        render(<ScraperStatusTable statuses={statuses} />)

        fireEvent.change(screen.getByLabelText(/Search scraper companies/i), {
            target: { value: 'Google' },
        })

        expect(screen.getByText('Google')).toBeInTheDocument()
        expect(screen.queryByText('Amazon')).not.toBeInTheDocument()
    })

    it('filters zero-job successful scrapers', () => {
        render(<ScraperStatusTable statuses={statuses} />)

        fireEvent.click(screen.getByRole('button', { name: /0 jobs/i }))

        expect(screen.getByText('Google')).toBeInTheDocument()
        expect(screen.queryByText('Amazon')).not.toBeInTheDocument()
        expect(screen.queryByText('Meta')).not.toBeInTheDocument()
    })

    it('sorts scraper rows by jobs', () => {
        render(<ScraperStatusTable statuses={statuses} />)

        fireEvent.change(screen.getByLabelText(/Sort scraper status/i), {
            target: { value: 'jobs' },
        })

        const rows = screen.getAllByText(/Amazon|Google|Meta/)
        expect(rows[0]).toHaveTextContent('Amazon')
    })
})
