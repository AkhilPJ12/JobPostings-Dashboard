import { fetchRenderedSource, fetchSource, isBlockedResponse, SourceBlockedError } from '@/lib/modules/ingestion/http'
import { getSourceFailures, resetSourceFailures } from '@/lib/modules/ingestion/health'
import { navigateSource } from '@/lib/modules/ingestion/browser'
import { fetchWithScrapling } from '@/lib/modules/ingestion/scrapling'
import type { Page } from 'playwright'

jest.mock('@/lib/modules/ingestion/scrapling', () => ({ fetchWithScrapling: jest.fn() }))

describe('source challenge handling', () => {
  const originalKey = process.env.SCRAPINGBEE_API_KEY
  const originalMode = process.env.SCRAPING_FALLBACK

  afterEach(() => {
    resetSourceFailures()
    jest.mocked(fetchWithScrapling).mockReset()
    if (originalKey === undefined) delete process.env.SCRAPINGBEE_API_KEY
    else process.env.SCRAPINGBEE_API_KEY = originalKey
    if (originalMode === undefined) delete process.env.SCRAPING_FALLBACK
    else process.env.SCRAPING_FALLBACK = originalMode
  })

  it('distinguishes empty results from challenge pages', async () => {
    expect(await isBlockedResponse(new Response('{"jobs":[]}', {
      headers: { 'content-type': 'application/json' },
    }))).toBe(false)
    expect(await isBlockedResponse(new Response('<title>Just a moment...</title>', {
      headers: { 'content-type': 'text/html' },
    }))).toBe(true)
  })

  it('reports a blocked source without a configured fallback', async () => {
    process.env.SCRAPING_FALLBACK = 'none'
    delete process.env.SCRAPINGBEE_API_KEY
    const direct = jest.fn().mockResolvedValue(new Response('Denied', { status: 403 }))
    await expect(fetchSource('https://careers.example.com/jobs', {}, direct))
      .rejects.toBeInstanceOf(SourceBlockedError)
    expect(direct).toHaveBeenCalledTimes(1)
    expect(getSourceFailures()).toEqual([expect.stringContaining('careers.example.com')])
  })

  it('recovers a blocked public GET through the provider without putting its key in the URL', async () => {
    process.env.SCRAPING_FALLBACK = 'scrapingbee'
    process.env.SCRAPINGBEE_API_KEY = 'test-private-key'
    const direct = jest.fn()
      .mockResolvedValueOnce(new Response('Denied', { status: 403 }))
      .mockResolvedValueOnce(new Response('<html>Job listing</html>', {
        headers: { 'content-type': 'text/html' },
      }))
    const result = await fetchSource('https://careers.example.com/jobs', {}, direct)
    expect(await result.text()).toContain('Job listing')
    const providerUrl = direct.mock.calls[1][0] as URL
    expect(providerUrl.hostname).toBe('app.scrapingbee.com')
    expect(providerUrl.searchParams.get('url')).toBe('https://careers.example.com/jobs')
    expect(providerUrl.toString()).not.toContain('test-private-key')
    expect(direct.mock.calls[1][1].headers.Authorization).toBe('Bearer test-private-key')
    expect(getSourceFailures()).toEqual([])
  })

  it('loads recovered browser HTML with links based on the original career URL', async () => {
    process.env.SCRAPING_FALLBACK = 'scrapingbee'
    process.env.SCRAPINGBEE_API_KEY = 'test-private-key'
    const previousFetch = global.fetch
    const providerFetch = jest.fn().mockResolvedValue(new Response('<html><head></head><body><a href="/jobs/1">Role</a></body></html>', {
      headers: { 'content-type': 'text/html' },
    }))
    global.fetch = providerFetch as unknown as typeof fetch
    const page = {
      on: jest.fn(),
      goto: jest.fn().mockResolvedValue({ status: () => 403, headers: () => ({}) }),
      url: jest.fn().mockReturnValue('https://careers.example.com/jobs'),
      content: jest.fn().mockResolvedValue('<title>Just a moment...</title>'),
      setContent: jest.fn().mockResolvedValue(undefined),
    }
    try {
      await navigateSource(page as unknown as Page, 'https://careers.example.com/jobs')
      expect(page.setContent.mock.calls[0][0]).toContain('<base href="https://careers.example.com/jobs">')
      expect(providerFetch).toHaveBeenCalledTimes(1)
      expect(getSourceFailures()).toEqual([])
      const responseListener = page.on.mock.calls[0][1]
      responseListener({ status: () => 429, url: () => 'https://api.example.com/jobs',
        request: () => ({ resourceType: () => 'fetch' }) })
      expect(getSourceFailures()).toEqual([expect.stringContaining('api.example.com')])
    } finally { global.fetch = previousFetch }
  })

  it('uses the free Scrapling HTTP fallback on a blocked GET', async () => {
    process.env.SCRAPING_FALLBACK = 'scrapling'
    process.env.SCRAPINGBEE_API_KEY = 'must-not-be-used'
    jest.mocked(fetchWithScrapling).mockResolvedValue(new Response('{"jobs":[1]}', {
      headers: { 'content-type': 'application/json' },
    }))
    const direct = jest.fn().mockResolvedValue(new Response('Denied', { status: 403 }))
    const result = await fetchSource('https://careers.example.com/api/jobs',
      { headers: { Accept: 'application/json' } }, direct)
    expect(await result.json()).toEqual({ jobs: [1] })
    expect(fetchWithScrapling).toHaveBeenCalledWith('https://careers.example.com/api/jobs', 'http')
    expect(direct).toHaveBeenCalledTimes(1)
    expect(getSourceFailures()).toEqual([])
  })

  it('escalates free browser recovery to Scrapling stealth mode only after HTTP is blocked', async () => {
    process.env.SCRAPING_FALLBACK = 'scrapling'
    jest.mocked(fetchWithScrapling)
      .mockResolvedValueOnce(new Response('Denied', { status: 403 }))
      .mockResolvedValueOnce(new Response('<html><head></head><body>Jobs</body></html>', {
        headers: { 'content-type': 'text/html' },
      }))
    expect(await fetchRenderedSource('https://careers.example.com/jobs')).toContain('Jobs')
    expect(jest.mocked(fetchWithScrapling).mock.calls.map(call => call[1])).toEqual(['http', 'browser'])
    expect(getSourceFailures()).toEqual([])
  })
})
