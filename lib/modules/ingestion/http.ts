import { noteSourceFailure } from './health'
import { fetchWithScrapling } from './scrapling'

let nextAllowedAt = 0
let scheduler = Promise.resolve()
let active = 0
const waiters: Array<() => void> = []
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class SourceBlockedError extends Error {
  constructor(public hostname: string, public status: number, public provider = 'direct') {
    super(`Source blocked by anti-bot protection (${hostname}, HTTP ${status}, ${provider})`)
    this.name = 'SourceBlockedError'
    noteSourceFailure(this.message)
  }
}

export class ScrapingProviderAuthenticationError extends Error {
  constructor() {
    super('ScrapingBee authentication failed (HTTP 401)')
    this.name = 'ScrapingProviderAuthenticationError'
    noteSourceFailure(this.message)
  }
}

export class SourceFallbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceFallbackError'
    noteSourceFailure(message)
  }
}

const challengePattern = /cf-chl-|cf-browser-verification|cloudflare ray id|<title[^>]*>\s*(?:just a moment|attention required|captcha)|checking your browser|verify you are human|captcha-container|datadome|akamai bot manager|perimeterx|px-captcha/i

export function looksLikeChallengeHtml(html: string): boolean {
  return challengePattern.test(html.slice(0, 32768))
}

async function responseExcerpt(response: Response): Promise<string> {
  if (!response.clone || !response.body) return ''
  const reader = response.clone().body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let excerpt = ''
  try {
    while (excerpt.length < 32768) {
      const chunk = await reader.read()
      if (chunk.done) break
      excerpt += decoder.decode(chunk.value, { stream: true })
    }
  } finally { void reader.cancel().catch(() => undefined) }
  return excerpt.slice(0, 32768)
}

export async function isBlockedResponse(response: Response): Promise<boolean> {
  if (response.status === 403 || response.status === 429 ||
      response.headers?.get('cf-mitigated') === 'challenge') return true
  const type = response.headers?.get('content-type') || ''
  if (!/html/i.test(type)) return false
  return looksLikeChallengeHtml(await responseExcerpt(response))
}

async function fetchWithScrapingBee(input: string | URL, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  const key = process.env.SCRAPINGBEE_API_KEY
  if (!key) throw new Error('SCRAPINGBEE_API_KEY is not configured')
  const url = new URL('https://app.scrapingbee.com/api/v1')
  url.searchParams.set('url', String(input))
  const accept = new Headers(init.headers).get('accept') || ''
  const apiRequest = /json/i.test(accept) || /\/(?:api|graphql)(?:\/|$)/i.test(new URL(String(input)).pathname)
  url.searchParams.set('render_js', apiRequest ? 'false' : 'true')
  if (process.env.SCRAPINGBEE_PREMIUM_PROXY === 'true') url.searchParams.set('premium_proxy', 'true')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    // The provider key stays in the header and is never included in thrown URLs.
    return await fetchImpl(url, { method: 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}` } })
  } finally { clearTimeout(timer) }
}

type Fallback = 'scrapling' | 'scrapingbee' | 'none'

function fallbackMode(): Fallback {
  const value = process.env.SCRAPING_FALLBACK || 'scrapling'
  if (value !== 'scrapling' && value !== 'scrapingbee' && value !== 'none') {
    throw new Error(`Unsupported SCRAPING_FALLBACK: ${value}`)
  }
  return value
}

async function recoverBlockedGet(input: string | URL, init: RequestInit,
  fetchImpl: typeof fetch, allowBrowser: boolean): Promise<Response> {
  const hostname = new URL(String(input)).hostname
  const mode = fallbackMode()
  if (mode === 'none') throw new SourceBlockedError(hostname, 403)
  if (mode === 'scrapingbee') {
    const response = await fetchWithScrapingBee(input, init, fetchImpl)
    if (response.status === 401) throw new ScrapingProviderAuthenticationError()
    if (!response.ok || await isBlockedResponse(response)) {
      throw new SourceBlockedError(hostname, response.status, 'scrapingbee')
    }
    return response
  }
  try {
    let http: Response | null = null
    try { http = await fetchWithScrapling(input, 'http') }
    catch (error) { if (!allowBrowser) throw error }
    if (http?.ok && !await isBlockedResponse(http)) return http
    if (allowBrowser) {
      const browser = await fetchWithScrapling(input, 'browser')
      if (browser.ok && !await isBlockedResponse(browser)) return browser
      throw new SourceBlockedError(hostname, browser.status, 'scrapling')
    }
    throw new SourceBlockedError(hostname, http?.status || 0, 'scrapling')
  } catch (error) {
    if (error instanceof SourceBlockedError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new SourceFallbackError(`Scrapling fallback failed (${hostname}): ${message}`)
  }
}

export async function fetchRenderedSource(input: string | URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await recoverBlockedGet(input, { headers: { Accept: 'text/html' } }, fetchImpl, true)
  const html = await response.text()
  if (looksLikeChallengeHtml(html)) {
    throw new SourceBlockedError(new URL(String(input)).hostname, response.status, fallbackMode())
  }
  return html
}

async function throttleStart() {
  const preceding = scheduler
  let release!: () => void
  scheduler = new Promise<void>(resolve => { release = resolve })
  await preceding
  try {
    const wait = Math.max(0, nextAllowedAt - Date.now())
    if (wait) await delay(wait)
    nextAllowedAt = Date.now() + 500
  } finally { release() }
}

/** Bounded HTTP access for public source APIs. Requests here only read postings. */
export async function fetchSource(input: string | URL, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  while (active >= 4) await new Promise<void>(resolve => waiters.push(resolve))
  active++
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await throttleStart()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)
      try {
        const response = await fetchImpl(input, { ...init, signal: controller.signal })
        if (await isBlockedResponse(response)) {
          if (response.status === 429 && attempt < 2) {
            const retryAfter = Number(response.headers.get('retry-after'))
            await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : 1000 * 2 ** attempt)
            continue
          }
          if ((!init.method || init.method.toUpperCase() === 'GET') && !init.body && fallbackMode() !== 'none') {
            const accept = new Headers(init.headers).get('accept') || ''
            const apiRequest = /json/i.test(accept) || /\/(?:api|graphql)(?:\/|$)/i.test(new URL(String(input)).pathname)
            return await recoverBlockedGet(input, init, fetchImpl,
              !apiRequest && process.env.SCRAPLING_BROWSER_READY === 'true')
          }
          throw new SourceBlockedError(new URL(String(input)).hostname, response.status)
        }
        if (response.ok || (response.status < 500) || attempt === 2) return response
        const retryAfter = Number(response.headers.get('retry-after'))
        await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : 1000 * 2 ** attempt)
      } catch (error) {
        if (error instanceof SourceBlockedError || error instanceof ScrapingProviderAuthenticationError ||
            error instanceof SourceFallbackError) throw error
        if (attempt === 2) throw error
        await delay(1000 * 2 ** attempt)
      } finally { clearTimeout(timer) }
    }
    throw new Error('Source request retry budget exhausted')
  } finally {
    active--
    waiters.shift()?.()
  }
}
