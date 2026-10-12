/** Run against a staging database populated with at least 100,000 visible jobs. */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { searchJobs } from '../lib/modules/jobs/repository'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const durations: number[] = []
  const cases = [
    { page: 1, pageSize: 20, sort: 'recent' as const },
    { page: 100, pageSize: 20, sort: 'recent' as const },
    { page: 1, pageSize: 20, sort: 'company' as const, q: 'engineer' },
  ]
  const first = await searchJobs(cases[0])
  if (first.total < 100000) throw new Error(`Staging has ${first.total} visible jobs; need 100,000 for this benchmark`)
  for (let i = 0; i < 10; i++) for (const query of cases) {
    const start = performance.now()
    const result = await searchJobs(query)
    durations.push(performance.now() - start)
    if (result.jobs.length > 20) throw new Error('Search returned an unbounded page')
    if (Buffer.byteLength(JSON.stringify(result)) > 128000) throw new Error('Search payload exceeded 128 KB')
  }
  durations.sort((a, b) => a - b)
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
  console.log(`Search p95: ${p95.toFixed(1)} ms across ${durations.length} staging RPC calls`)
  if (p95 >= 500) process.exitCode = 1
}

main().catch(error => { console.error(error); process.exitCode = 1 })
