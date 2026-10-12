import type { Page } from 'playwright'
import { fetchRenderedSource, looksLikeChallengeHtml, SourceBlockedError } from './http'
import { noteSourceFailure } from './health'

const monitoredPages = new WeakSet<Page>()

function monitorBrowserApiFailures(page: Page): void {
  if (monitoredPages.has(page)) return
  monitoredPages.add(page)
  page.on('response', response => {
    if (response.status() !== 403 && response.status() !== 429) return
    if (!['xhr', 'fetch'].includes(response.request().resourceType())) return
    try {
      const host = new URL(response.url()).hostname
      const pageHost = new URL(page.url()).hostname
      const site = pageHost.split('.').slice(-2).join('.')
      if (host === pageHost || host.endsWith(`.${site}`)) {
        noteSourceFailure(`First-party browser API blocked (${host}, HTTP ${response.status()})`)
      }
    } catch { /* Ignore malformed third-party response URLs. */ }
  })
}

/** Detect challenge pages after browser navigation; optionally recover rendered HTML. */
export async function navigateSource(page: Page, url: string, options?: Parameters<Page['goto']>[1]): Promise<void> {
  monitorBrowserApiFailures(page)
  const response = await page.goto(url, options)
  const status = response?.status() || 0
  const challenged = status === 403 || status === 429 ||
    response?.headers()['cf-mitigated'] === 'challenge' ||
    looksLikeChallengeHtml(await page.content())
  if (!challenged) return
  if (process.env.SCRAPING_FALLBACK === 'none') throw new SourceBlockedError(new URL(url).hostname, status)

  const html = await fetchRenderedSource(url)
  // Relative links on the recovered page must still resolve to the employer site.
  const base = `<base href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`
  const resolvedHtml = /<head\b/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, match => `${match}${base}`)
    : `${base}${html}`
  await page.setContent(resolvedHtml,
    { waitUntil: 'domcontentloaded', timeout: options?.timeout || 30000 })
}
