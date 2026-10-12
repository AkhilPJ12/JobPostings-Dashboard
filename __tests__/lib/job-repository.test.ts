const rpc = jest.fn()
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
import { getJobDetailRecord, searchJobSummaries, searchJobs } from '@/lib/modules/jobs/repository'

const row = {
  id: 5, external_job_id: 'source_5', title: 'Engineer', company: 'Example',
  company_color: '#000', company_icon: null, location: 'Austin, TX',
  location_type: null, department: 'Engineering', employment_type: null,
  posted_date: '2026-10-10', first_seen_date: '2026-10-10', date_provenance: 'source',
  end_date: null, summary: 'Source summary', summary_generated: false,
  security_clearance: 'N/A', h1b_sponsorship: 'N/A', pay_range: 'Not specified',
  job_url: 'https://example.com/apply',
}

describe('job read projections', () => {
  beforeEach(() => rpc.mockReset())
  it('reads a bounded summary page and represents missing facts as null internally', async () => {
    rpc.mockResolvedValue({ data: { jobs: [row], total: 100000, page: 2, pageSize: 20 }, error: null })
    const result = await searchJobSummaries({ page: 2 })
    expect(rpc).toHaveBeenCalledWith('search_jobs', expect.objectContaining({ p_query: expect.objectContaining({ page: 2, pageSize: 20 }) }))
    expect(result.jobs).toHaveLength(1)
    expect(result.total).toBe(100000)
    expect(result.jobs[0].locationType).toBeNull()
    expect(result.jobs[0].visaSponsorship).toBeNull()
  })
  it('maps missing facts to Unknown for the current UI', async () => {
    rpc.mockResolvedValue({ data: { jobs: [row], total: 1, page: 1, pageSize: 20 }, error: null })
    const result = await searchJobs()
    expect(result.jobs[0].locationType).toBe('Unknown')
    expect(result.jobs[0].payRange).toBe('Unknown')
  })
  it('fetches source description only on detail', async () => {
    rpc.mockResolvedValue({ data: { ...row, description: 'Original posting text', required_qualifications: ['TypeScript'] }, error: null })
    const result = await getJobDetailRecord('5')
    expect(rpc).toHaveBeenCalledWith('get_public_job', { p_id: 5 })
    expect(result?.description).toBe('Original posting text')
    expect(result?.requiredQualifications).toEqual(['TypeScript'])
  })
})
