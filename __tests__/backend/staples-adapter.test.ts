import { parseStaplesPosting } from '@/lib/modules/ingestion/adapters/staples'

describe('Staples source parser', () => {
  it('extracts source facts from the detail page JSON-LD without requiring an h1', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting',
      title: 'Transportation Manager', datePosted: '2026-10-17',
      description: '<p>Coordinate supply chain projects.</p>',
      identifier: { '@type': 'PropertyValue', value: '76313' },
      jobLocation: [{ address: { addressLocality: 'Framingham', addressRegion: 'Massachusetts',
        addressCountry: 'United States' } }],
    })}</script></head><body><h2 class="job-description__title">Transportation Manager</h2></body></html>`
    expect(parseStaplesPosting(html)).toEqual({
      title: 'Transportation Manager', postedDate: '2026-10-17',
      descriptionHtml: '<p>Coordinate supply chain projects.</p>',
      location: 'Framingham, Massachusetts, United States', jobId: '76313',
    })
  })

  it('ignores malformed and unrelated JSON-LD', () => {
    expect(parseStaplesPosting('<script type="application/ld+json">{bad}</script>')).toBeNull()
    expect(parseStaplesPosting('<script type="application/ld+json">{"@type":"Organization"}</script>')).toBeNull()
  })
})
