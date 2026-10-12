const rpc = jest.fn()
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
import { getScraperStatuses } from '@/lib/job-data'

describe('getScraperStatuses', () => {
  beforeEach(() => rpc.mockReset())
  it('reads the aggregate status projection in one request', async () => {
    rpc.mockResolvedValue({ data: [
      { company_name: 'Amazon', company_icon: null, status: 'Error', completed_at: '2026-03-01T01:00:00Z', duration_seconds: 12, total_jobs: 2 },
      { company_name: 'Google', company_icon: 'https://example.com/google.png', status: 'Not Run', completed_at: null, duration_seconds: null, total_jobs: 0 },
    ], error: null })
    const result = await getScraperStatuses()
    expect(rpc).toHaveBeenCalledWith('get_public_scraper_statuses')
    expect(result).toHaveLength(2)
    expect(result[0].lastScrapedAt).toBeInstanceOf(Date)
    expect(result[0].totalJobs).toBe(2)
    expect(result[1].status).toBe('Not Run')
  })
  it('propagates data errors rather than claiming no runs', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(getScraperStatuses()).rejects.toEqual({ message: 'unavailable' })
  })
})
