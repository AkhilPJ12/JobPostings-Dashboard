import { parseEnrichJobsCliArgs } from '@/scripts/enrich-jobs-ai'
import { runEnrichmentWorker } from '@/lib/modules/enrichment/worker'
import type { SupabaseClient } from '@supabase/supabase-js'

const payload = { title: 'Engineer', description: 'Build TypeScript services.', summary: 'Engineering role.' }
const extraction = {
  summary: 'Build services.', summaryEvidence: ['Build TypeScript services.'],
  requiredQualifications: [], preferredQualifications: [],
  department: { value: null, evidence: null }, payRange: { value: null, evidence: null },
  locationType: { value: null, evidence: null }, employmentType: { value: null, evidence: null },
  h1bSponsorship: { value: null, evidence: null }, securityClearance: { value: null, evidence: null },
}

function fakeDb(claims: unknown[], quota: boolean) {
  const calls: Array<[string, Record<string, unknown>]> = []
  return {
    calls,
    client: { rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args])
      if (name === 'claim_ai_worker_lease') return { data: 'worker-token', error: null }
      if (name === 'claim_ai_enrichment') return { data: claims.shift() ?? null, error: null }
      if (name === 'consume_ai_enrichment_quota') return { data: quota, error: null }
      return { data: true, error: null }
    }) } as unknown as SupabaseClient,
  }
}

describe('Ollama enrichment worker', () => {
  it('parses manual flags', () => {
    expect(parseEnrichJobsCliArgs(['--limit','25','--company','Amazon','--status','failed','--dry-run']))
      .toEqual({ limit: 25, company: 'Amazon', status: 'failed', dryRun: true, help: false })
  })

  it('claims, consumes quota, and publishes validated results', async () => {
    const db = fakeDb([{ queue_id: 1, lease_token: 'lease', payload }], true)
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: JSON.stringify(extraction) } }) })
    const result = await runEnrichmentWorker(db.client, { limit: 2, apiKey: 'key', fetchImpl: fetchImpl as typeof fetch, sleep: async () => {} })
    expect(result.enriched).toBe(1)
    expect(db.calls.map(([name]) => name)).toEqual([
      'claim_ai_worker_lease','claim_ai_enrichment','renew_ai_worker_lease',
      'consume_ai_enrichment_quota','finish_ai_enrichment','claim_ai_enrichment','release_ai_worker_lease',
    ])
  })

  it('stops without a cloud request when application quota is exhausted', async () => {
    const db = fakeDb([{ queue_id: 1, lease_token: 'lease', payload }], false)
    const fetchImpl = jest.fn()
    const result = await runEnrichmentWorker(db.client, { limit: 2, apiKey: 'key', fetchImpl: fetchImpl as typeof fetch, sleep: async () => {} })
    expect(result.quotaStopped).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(db.calls.map(([name]) => name)).toEqual([
      'claim_ai_worker_lease','claim_ai_enrichment','renew_ai_worker_lease',
      'consume_ai_enrichment_quota','release_ai_enrichment','release_ai_worker_lease',
    ])
  })
})
