import { supabase } from '@/lib/supabase'
import { getEnrichmentHealth, getJobDetailRecord, getJobFacets,
  getPublicScraperStatuses, searchJobSummaries } from '@/lib/modules/jobs/repository'

describe('public Supabase contract', () => {
  it('serves bounded summaries, facets, detail, and operations health', async () => {
    const [page, facets, statuses, health] = await Promise.all([
      searchJobSummaries({ page: 1, pageSize: 20 }), getJobFacets(),
      getPublicScraperStatuses(), getEnrichmentHealth(),
    ])
    expect(page.jobs.length).toBeLessThanOrEqual(20)
    expect(page.total).toBeGreaterThanOrEqual(page.jobs.length)
    expect(facets.companies).toEqual(expect.any(Array))
    expect(statuses).toEqual(expect.any(Array))
    expect(health.pending).toEqual(expect.any(Number))
    if (page.jobs.length) {
      expect(page.jobs[0].summary === null || typeof page.jobs[0].summary === 'string').toBe(true)
      const detail = await getJobDetailRecord(page.jobs[0].id)
      expect(detail?.id).toBe(page.jobs[0].id)
      expect(detail?.description).toEqual(expect.any(String))
    }
  })

  it('does not expose source or operations tables to the public key', async () => {
    for (const table of ['jobs', 'companies', 'ai_enrichment_queue', 'scraper_runs'] as const) {
      const { error } = await supabase.from(table).select('id').limit(1)
      expect(error).not.toBeNull()
    }
  })
})
