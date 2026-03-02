const mockOrderRuns = jest.fn()
const mockInRuns = jest.fn()
const mockOrderCompanies = jest.fn()
const mockEqCompanies = jest.fn()
const mockSelectCompanies = jest.fn()
const mockSelectRuns = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
    supabase: {
        from: (...args: unknown[]) => mockFrom(...args),
    },
}))

import { getScraperStatuses } from '@/lib/job-data'

describe('getScraperStatuses', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns latest status per company', async () => {
        const companiesData = [{ name: 'Amazon' }, { name: 'Google' }]
        const runsData = [
            { company_name: 'Amazon', status: 'Error', completed_at: '2026-03-01T01:00:00Z', duration_seconds: 12, error_message: 'timeout' },
            { company_name: 'Amazon', status: 'Successful', completed_at: '2026-02-28T01:00:00Z', duration_seconds: 30, error_message: null },
            { company_name: 'Google', status: 'Partial', completed_at: '2026-03-01T02:00:00Z', duration_seconds: 20, error_message: null },
        ]

        mockOrderCompanies.mockResolvedValue({ data: companiesData, error: null })
        mockEqCompanies.mockReturnValue({ order: mockOrderCompanies })
        mockSelectCompanies.mockReturnValue({ eq: mockEqCompanies })

        mockOrderRuns.mockResolvedValue({ data: runsData, error: null })
        mockInRuns.mockReturnValue({ order: mockOrderRuns })
        mockSelectRuns.mockReturnValue({ in: mockInRuns })

        mockFrom.mockImplementation((table: string) => {
            if (table === 'companies') return { select: mockSelectCompanies }
            if (table === 'scraper_runs') return { select: mockSelectRuns }
            throw new Error(`unexpected table: ${table}`)
        })

        const result = await getScraperStatuses()

        expect(result).toHaveLength(2)
        expect(result[0].companyName).toBe('Amazon')
        expect(result[0].status).toBe('Error')
        expect(result[0].durationSeconds).toBe(12)
        expect(result[1].companyName).toBe('Google')
        expect(result[1].status).toBe('Partial')
    })

    it('returns Not Run for all companies when scraper_runs query fails', async () => {
        const companiesData = [{ name: 'Meta' }, { name: 'Visa' }]

        mockOrderCompanies.mockResolvedValue({ data: companiesData, error: null })
        mockEqCompanies.mockReturnValue({ order: mockOrderCompanies })
        mockSelectCompanies.mockReturnValue({ eq: mockEqCompanies })

        mockOrderRuns.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } })
        mockInRuns.mockReturnValue({ order: mockOrderRuns })
        mockSelectRuns.mockReturnValue({ in: mockInRuns })

        mockFrom.mockImplementation((table: string) => {
            if (table === 'companies') return { select: mockSelectCompanies }
            if (table === 'scraper_runs') return { select: mockSelectRuns }
            throw new Error(`unexpected table: ${table}`)
        })

        const result = await getScraperStatuses()

        expect(result).toEqual([
            {
                companyName: 'Meta',
                status: 'Not Run',
                lastScrapedAt: null,
                durationSeconds: null,
                errorMessage: null,
            },
            {
                companyName: 'Visa',
                status: 'Not Run',
                lastScrapedAt: null,
                durationSeconds: null,
                errorMessage: null,
            },
        ])
    })
})

