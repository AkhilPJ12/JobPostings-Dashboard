/** One non-publishing cloud request to verify model access and extraction shape. */
import { getSupabaseAdminClient } from './scraper-utils'
import { OllamaCloudProvider } from '../lib/modules/enrichment/ollama'

async function main() {
  const model = process.env.OLLAMA_MODEL || 'gemma4:31b'
  const key = process.env.OLLAMA_API_KEY
  if (!key) throw new Error('Missing OLLAMA_API_KEY')
  const db = getSupabaseAdminClient()
  const { data, error } = await db.from('jobs').select('raw_job_payload')
    .eq('is_active', true).not('raw_job_payload', 'is', null).limit(30)
  if (error) throw error
  const source = data?.map(row => row.raw_job_payload)
    .find(payload => payload && typeof payload === 'object' && !Array.isArray(payload) &&
      typeof payload.description === 'string' && payload.description.length > 200)
  if (!source || Array.isArray(source) || typeof source !== 'object') {
    throw new Error('No active source posting with a usable description was found')
  }
  const provider = new OllamaCloudProvider(model, key)
  const response = await provider.enrich(source, async () => {
    const { data: allowed, error: quotaError } = await db.rpc('consume_ai_enrichment_quota', {
      p_usage_date: new Date().toISOString().slice(0, 10), p_model: model, p_max_requests: 1200,
    })
    if (quotaError) throw quotaError
    return allowed === true
  })
  console.log(JSON.stringify({ model, requests: response.requests,
    extractedFields: Object.keys(response.result), inputTokens: response.inputTokens,
    outputTokens: response.outputTokens, published: false }))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
