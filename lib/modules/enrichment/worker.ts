import type { SupabaseClient } from '@supabase/supabase-js'
import { OllamaCloudProvider, OllamaError } from './ollama'

export interface EnrichmentRunSummary { attempted: number; enriched: number; failed: number; quotaStopped: boolean }

export async function runEnrichmentWorker(db: SupabaseClient, options: {
  model?: string; apiKey?: string; limit?: number; requestsPerMinute?: number; maxRequestsPerDay?: number;
  fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; company?: string; status?: 'pending' | 'failed'
} = {}): Promise<EnrichmentRunSummary> {
  const model = options.model || process.env.OLLAMA_MODEL || 'gemma4:31b'
  const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY ?? ''
  if (!apiKey) throw new Error('Missing OLLAMA_API_KEY')
  const provider = new OllamaCloudProvider(model, apiKey, options.fetchImpl)
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 200)
  const perMinute = Math.min(Math.max(options.requestsPerMinute ?? 8, 1), 60)
  const daily = Math.min(Math.max(options.maxRequestsPerDay ?? 1200, 1), 1200)
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const result: EnrichmentRunSummary = { attempted: 0, enriched: 0, failed: 0, quotaStopped: false }
  const { data: workerToken, error: workerError } = await db.rpc('claim_ai_worker_lease')
  if (workerError) throw workerError
  if (!workerToken) return result
  let lastCall = 0
  let calls = 0
  try {
  while (calls < limit) {
    const { data: claim, error: claimError } = await db.rpc('claim_ai_enrichment', {
      p_model: model, p_lease_seconds: 180, p_company: options.company ?? null, p_state: options.status ?? 'pending',
    })
    if (claimError) throw claimError
    if (!claim) break
    const row = claim as { queue_id: number; lease_token: string; payload: Record<string, unknown> }
    result.attempted++
    const started = Date.now()
    try {
      const response = await provider.enrich(row.payload, async () => {
        if (calls >= limit) return false
        const waitMs = Math.max(0, lastCall + Math.ceil(60000 / perMinute) - Date.now())
        if (waitMs) await sleep(waitMs)
        const { data: renewed, error: renewError } = await db.rpc('renew_ai_worker_lease', { p_token: workerToken })
        if (renewError) throw renewError
        if (!renewed) throw new OllamaError('AI worker lease lost', undefined, true)
        const { data, error } = await db.rpc('consume_ai_enrichment_quota', {
          p_usage_date: new Date().toISOString().slice(0, 10), p_model: model, p_max_requests: daily,
        })
        if (error) throw error
        if (data === true) { lastCall = Date.now(); calls++ }
        return data === true
      })
      const { data: published, error } = await db.rpc('finish_ai_enrichment', {
        p_queue_id: row.queue_id, p_lease_token: row.lease_token, p_result: response.result,
        p_latency_ms: Date.now() - started, p_input_tokens: response.inputTokens,
        p_output_tokens: response.outputTokens,
      })
      if (error) throw error
      if (published) result.enriched++
    } catch (error) {
      const failure = error instanceof OllamaError ? error : new OllamaError(String(error), undefined, true)
      if (failure.message.includes('quota exhausted')) {
        const { error: releaseError } = await db.rpc('release_ai_enrichment', {
          p_queue_id: row.queue_id, p_lease_token: row.lease_token, p_delay_seconds: 3600,
        })
        if (releaseError) throw releaseError
        result.quotaStopped = true
        break
      }
      const { error: failError } = await db.rpc('fail_ai_enrichment', {
        p_queue_id: row.queue_id, p_lease_token: row.lease_token,
        p_error: failure.message, p_retryable: failure.retryable,
        p_retry_after_seconds: failure.retryAfterSeconds,
      })
      if (failError) throw failError
      result.failed++
      if (failure.status === 429) {
        result.quotaStopped = true
        break
      }
      if (failure.status === 401 || failure.status === 403) break
      if (failure.message === 'AI worker lease lost') break
    }
  }
  } finally {
    const { error } = await db.rpc('release_ai_worker_lease', { p_token: workerToken })
    if (error) throw error
  }
  return result
}
