import { NextResponse } from 'next/server'
import { getPublicScraperStatuses, getEnrichmentHealth } from '@/lib/modules/jobs/repository'

export async function GET() {
  try {
    const [statuses, enrichment] = await Promise.all([getPublicScraperStatuses(), getEnrichmentHealth()])
    return NextResponse.json({ statuses, enrichment }, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('Could not load scraper status', error)
    return NextResponse.json({ error: 'Status is temporarily unavailable' }, { status: 503 })
  }
}
