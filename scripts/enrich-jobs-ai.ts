#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getSupabaseAdminClient } from './scraper-utils'
import { runEnrichmentWorker } from '../lib/modules/enrichment/worker'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

export interface EnrichJobsCliArgs {
  limit?: number
  company?: string
  status: 'pending' | 'failed'
  dryRun: boolean
  help: boolean
}

export function parseEnrichJobsCliArgs(argv: string[]): EnrichJobsCliArgs {
  const options: EnrichJobsCliArgs = { status: 'pending', dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=', 2)
    if (flag === '--help' || flag === '-h') options.help = true
    else if (flag === '--dry-run') options.dryRun = true
    else if (['--limit', '--company', '--status'].includes(flag)) {
      const value = inline ?? argv[++i]
      if (!value) throw new Error(`${flag} requires a value`)
      if (flag === '--limit') {
        const parsed = Number(value)
        if (!Number.isInteger(parsed) || parsed < 1) throw new Error('--limit must be a positive integer')
        options.limit = parsed
      } else if (flag === '--company') options.company = value.trim()
      else if (value === 'pending' || value === 'failed') options.status = value
      else throw new Error('--status must be pending or failed')
    } else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return options
}

async function main() {
  const args = parseEnrichJobsCliArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: pnpm enrich:ai -- [--limit 200] [--company NAME] [--status pending|failed] [--dry-run]')
    return
  }
  const db = getSupabaseAdminClient()
  if (args.dryRun) {
    const { data: count, error } = await db.rpc('count_ai_enrichment_queue', {
      p_model: process.env.OLLAMA_MODEL || 'gemma4:31b', p_state: args.status, p_company: args.company ?? null,
    })
    if (error) throw error
    console.log(`Queued ${args.status} jobs${args.company ? ` for ${args.company}` : ''}: ${count ?? 0}`)
    return
  }
  const summary = await runEnrichmentWorker(db, {
    limit: args.limit, company: args.company, status: args.status,
    requestsPerMinute: Number(process.env.AI_REQUESTS_PER_MINUTE || 8),
    maxRequestsPerDay: Number(process.env.AI_MAX_REQUESTS_PER_DAY || 1200),
  })
  console.log('AI enrichment summary:', summary)
  if (summary.failed > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('enrich-jobs-ai.ts') || process.argv[1]?.endsWith('enrich-jobs-ai.js')) {
  main().catch(error => { console.error('AI enrichment failed:', error); process.exitCode = 1 })
}
