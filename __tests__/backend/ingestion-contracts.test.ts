import { classifyScrapeResult } from '@/lib/modules/ingestion/contracts'
import { SOURCES, partitionSources } from '@/lib/modules/ingestion/registry'
import { fetchSource } from '@/lib/modules/ingestion/http'
import { selectSources } from '@/scripts/scrape-all-jobs'

describe('ingestion contracts', () => {
  it('classifies a complete zero-job scrape as successful and partial writes as partial', () => {
    const empty = { company: 'Example', fetched: 0, eligible: 0, written: 0, rejected: 0, complete: true, errors: [] }
    expect(classifyScrapeResult(empty)).toBe('Successful')
    expect(classifyScrapeResult({ ...empty, eligible: 3, written: 2 })).toBe('Partial')
    expect(classifyScrapeResult({ ...empty, complete: false })).toBe('Partial')
  })

  it('partitions every registered company exactly once per source kind', () => {
    expect(SOURCES).toHaveLength(26)
    expect(new Set(SOURCES.map(source => source.name)).size).toBe(SOURCES.length)
    for (const kind of ['api','browser'] as const) {
      const expected = SOURCES.filter(source => source.kind === kind).map(source => source.name).sort()
      const actual = [0,1,2,3].flatMap(batch => partitionSources(kind,batch).map(source => source.name)).sort()
      expect(actual).toEqual(expected)
    }
  })

  it('rejects invalid runner flags before any source work starts', () => {
    expect(selectSources(['--api-only','--batch','0']).sources).toEqual(partitionSources('api',0))
    expect(() => selectSources(['--ap-only'])).toThrow('Unknown option')
  })

  it('does not retry a source API 404', async () => {
    const mock = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await fetchSource('https://example.com/jobs', {}, mock as typeof fetch)
    expect(result.status).toBe(404)
    expect(mock).toHaveBeenCalledTimes(1)
  })
})
