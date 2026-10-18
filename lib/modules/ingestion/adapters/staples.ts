/** Parse Staples' public JobPosting JSON-LD without a browser or database. */
export interface StaplesPosting {
  title: string
  descriptionHtml: string
  postedDate: string | null
  location: string
  jobId: string
}

function firstText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

export function parseStaplesPosting(html: string): StaplesPosting | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const script of scripts) {
    let parsed: unknown
    try { parsed = JSON.parse(script[1]) } catch { continue }
    const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const candidates = Array.isArray(parsed) ? parsed : Array.isArray(root['@graph']) ? root['@graph'] : [parsed]
    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue
      const posting = item as Record<string, unknown>
      const types = Array.isArray(posting['@type']) ? posting['@type'] : [posting['@type']]
      if (!types.includes('JobPosting')) continue
      const title = firstText(posting.title)
      if (!title) continue
      const location = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation
      const address = location && typeof location === 'object'
        ? (location as Record<string, unknown>).address : null
      const fields = address && typeof address === 'object' ? address as Record<string, unknown> : {}
      const identifier = posting.identifier && typeof posting.identifier === 'object'
        ? (posting.identifier as Record<string, unknown>).value : posting.identifier
      const date = firstText(posting.datePosted).slice(0, 10)
      return {
        title,
        descriptionHtml: firstText(posting.description),
        postedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        location: [fields.addressLocality, fields.addressRegion, fields.addressCountry]
          .map(firstText).filter(Boolean).join(', '),
        jobId: firstText(identifier),
      }
    }
  }
  return null
}
