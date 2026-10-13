/** Run with an annotated JSON file of at least 50 public postings before enabling scheduled enrichment. */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { readFile } from 'fs/promises'
import { z } from 'zod'
import { getSupabaseAdminClient } from './scraper-utils'
import { OllamaCloudProvider } from '../lib/modules/enrichment/ollama'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const fields = ['payRange','h1bSponsorship','securityClearance','locationType','employmentType','department'] as const
const Case = z.object({
  source: z.record(z.unknown()),
  reviewed: z.literal(true),
  expected: z.object({
    ...Object.fromEntries(fields.map(field => [field, z.string().nullable()])) as Record<typeof fields[number], z.ZodNullable<z.ZodString>>,
    requiredQualifications: z.array(z.string()), preferredQualifications: z.array(z.string()),
  }),
})

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: pnpm exec tsx scripts/evaluate-ai.ts annotated-postings.json')
  const checked = z.array(Case).min(50).safeParse(JSON.parse(await readFile(file, 'utf8')))
  if (!checked.success) throw new Error('Evaluation requires at least 50 fully annotated postings with reviewed=true')
  const reviewed = checked.data
  const adversarial = z.array(Case).min(5).parse(JSON.parse(await readFile(
    path.resolve(process.cwd(), '__tests__/fixtures/ai-adversarial.json'), 'utf8')))
  const cases = [...reviewed, ...adversarial]
  const model = process.env.OLLAMA_MODEL || 'gemma4:31b'
  const provider = new OllamaCloudProvider(model, process.env.OLLAMA_API_KEY || '')
  const db = getSupabaseAdminClient()
  let correct = 0, predicted = 0, explicit = 0, criticalUnsupported = 0
  for (const item of cases) {
    const { result } = await provider.enrich(item.source, async () => {
      const { data, error } = await db.rpc('consume_ai_enrichment_quota', {
        p_usage_date: new Date().toISOString().slice(0,10), p_model: model, p_max_requests: 1200,
      })
      if (error) throw error
      return data === true
    })
    for (const field of fields) {
      const expected = item.expected[field]
      const observed = result[field] ?? null
      if (expected !== null) explicit++
      if (observed !== null) {
        predicted++
        if (observed === expected) correct++
        else if (fields.indexOf(field) < 3) criticalUnsupported++
      }
    }
    for (const field of ['requiredQualifications','preferredQualifications'] as const) {
      const expected = new Set(item.expected[field].map(value => value.toLowerCase().trim()))
      explicit += expected.size
      for (const value of result[field] || []) {
        predicted++
        if (expected.has(value.toLowerCase().trim())) correct++
      }
    }
  }
  const precision = predicted ? correct / predicted : 0
  const coverage = explicit ? correct / explicit : 0
  console.log({ representativeCases: reviewed.length, adversarialCases: adversarial.length,
    precision, coverage, criticalUnsupported })
  if (precision < 0.95 || coverage < 0.9 || criticalUnsupported > 0) process.exitCode = 1
}

main().catch(error => { console.error(error); process.exitCode = 1 })
