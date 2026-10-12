import { render, screen, fireEvent, waitFor } from '@/__tests__/utils/test-utils'
import { JobDashboard } from '@/components/job-dashboard'
import { dashboardJobs } from '@/__tests__/utils/job-fixtures'
import { JobSearchQuerySchema, parseSearchParams, toSearchParams } from '@/lib/modules/jobs/contracts'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }), usePathname: () => '/' }))

const facets = {
  companies: [{ value: 'Amazon', count: 50 }], departments: [{ value: 'Engineering', count: 50 }],
  employmentTypes: [{ value: 'Full-time', count: 50 }], visaSponsorship: [{ value: 'Unknown', count: 50 }],
  securityClearance: [{ value: 'Unknown', count: 50 }],
}

describe('server paged dashboard', () => {
  beforeEach(() => replace.mockReset())
  it('keeps filters and paging in the URL and uses the server total', async () => {
    const query = JobSearchQuerySchema.parse({ page: 2, q: 'engineer' })
    render(<JobDashboard initialJobs={dashboardJobs.slice(0, 2)} initialPagedJobs={{
      jobs: dashboardJobs.slice(0, 2), total: 50, page: 2, pageSize: 20,
    }} initialQuery={query} initialFacets={facets} initialCompanyCount={1} />)
    expect(screen.getAllByText('50 results')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/?q=engineer&page=3', { scroll: false }))
  })
  it('round-trips search params including repeated filters', () => {
    const query = parseSearchParams(new URLSearchParams('q=engineer&company=Amazon&company=OpenAI&page=2'))
    expect(query.companies).toEqual(['Amazon', 'OpenAI'])
    expect(parseSearchParams(toSearchParams(query))).toEqual(query)
  })
})
