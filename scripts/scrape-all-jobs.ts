/** Scheduled and manual orchestrator for all registered sources. */
import { spawn } from 'child_process'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { SOURCES, partitionSources, type RegisteredSource } from '../lib/modules/ingestion/registry'
import { classifyScrapeResult, type ScrapeResult } from '../lib/modules/ingestion/contracts'
import { supabase, cleanupOldJobs, purgeInactiveJobs } from './scraper-utils'

interface CommandResult { code: number | null; output: string; timedOut: boolean }
function runCommand(source: RegisteredSource, timeoutMs = 600000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', path.join(__dirname, source.script), ...(source.args || [])], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, SCRAPER_MANAGED_RUN: '1' },
      stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    })
    let output = ''
    let timedOut = false
    const stopGroup = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch { /* Process already exited. */ }
    }
    const timer = setTimeout(() => {
      timedOut = true
      stopGroup('SIGTERM')
      setTimeout(() => stopGroup('SIGKILL'), 5000).unref()
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); process.stdout.write(chunk) })
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, timedOut }) })
  })
}

function parseResult(output: string): ScrapeResult | null {
  const line = output.split(/\r?\n/).find(value => value.startsWith('SCRAPE_RESULT_JSON:'))
  if (!line) return null
  try {
    const parsed = JSON.parse(line.slice('SCRAPE_RESULT_JSON:'.length)) as ScrapeResult
    return typeof parsed.company === 'string' && typeof parsed.written === 'number' ? parsed : null
  } catch { return null }
}

async function runSource(source: RegisteredSource, runGroup: string) {
  const startedAt = new Date().toISOString()
  const { data: token, error: leaseError } = await supabase.rpc('claim_scraper_lease', {
    p_company: source.name, p_seconds: 900,
  })
  if (leaseError) throw leaseError
  if (!token) { console.log(`Skipping ${source.name}; another run owns its lease.`); return 'Skipped' }
  let status: 'Successful' | 'Partial' | 'Error' = 'Error'
  let errorMessage: string | null = null
  try {
    console.log(`Starting ${source.name}`)
    const command = await runCommand(source)
    const result = parseResult(command.output)
    if (command.timedOut) errorMessage = 'Scraper timed out'
    else if (command.code !== 0) {
      status = result && result.written > 0 ? 'Partial' : 'Error'
      errorMessage = result?.errors.join('; ') || `Scraper exited with code ${command.code}`
    }
    else if (!result || result.company !== source.name) errorMessage = 'Scraper did not report a structured result'
    else status = classifyScrapeResult(result)
    if (status === 'Partial') errorMessage = result?.errors.join('; ') || 'Incomplete source or write result'
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error)
  }
  const { data: saved, error: finishError } = await supabase.rpc('finish_scraper_lease', {
    p_company: source.name, p_token: token as string, p_run_group: runGroup,
    p_status: status, p_started_at: startedAt, p_completed_at: new Date().toISOString(), p_error: errorMessage || '',
  })
  if (finishError) throw finishError
  if (!saved) throw new Error(`Lost run lease for ${source.name}`)
  console.log(`${source.name}: ${status}${errorMessage ? ` (${errorMessage})` : ''}`)
  return status
}

export function selectSources(argv: string[]): { sources: RegisteredSource[]; maintenance: boolean } {
  for (const arg of argv) if (arg.startsWith('--') &&
    !['--maintenance-only','--api-only','--browser-only','--batch'].includes(arg)) {
    throw new Error(`Unknown option: ${arg}`)
  }
  if (argv.includes('--api-only') && argv.includes('--browser-only')) throw new Error('Choose one source kind')
  if (argv.includes('--maintenance-only')) {
    if (argv.length !== 1) throw new Error('--maintenance-only cannot be combined with a source filter')
    return { sources: [], maintenance: true }
  }
  const kind = argv.includes('--api-only') ? 'api' : argv.includes('--browser-only') ? 'browser' : null
  const batchPosition = argv.indexOf('--batch')
  const batch = batchPosition >= 0 ? Number(argv[batchPosition + 1]) : null
  if (batchPosition >= 0 && (!Number.isInteger(batch) || batch! < 0 || batch! > 3 || !kind)) {
    throw new Error('--batch requires 0..3 and --api-only or --browser-only')
  }
  const filter = argv.find(value => !value.startsWith('--') && (batchPosition < 0 || value !== argv[batchPosition + 1]))
  const selected = batch === null ? SOURCES.filter(source => !kind || source.kind === kind)
    : partitionSources(kind!, batch)
  const sources = filter ? selected.filter(source => source.name.toLowerCase().includes(filter.toLowerCase()) || source.script.includes(filter.toLowerCase())) : selected
  if (filter && sources.length === 0) throw new Error(`No scraper matches ${filter}`)
  return { sources, maintenance: !kind && batch === null && !filter }
}

async function main() {
  const { sources, maintenance } = selectSources(process.argv.slice(2))
  if (maintenance) {
    await cleanupOldJobs(14)
    await purgeInactiveJobs(180)
  }
  const group = process.env.GITHUB_RUN_ID || randomUUID()
  const api = sources.filter(source => source.kind === 'api')
  const browser = sources.filter(source => source.kind === 'browser')
  const statuses: string[] = []
  // Each source process may issue four HTTP requests. Keep one process per
  // workflow worker so its request ceiling remains four, not sixteen.
  for (const source of api) statuses.push(await runSource(source, group))
  for (const source of browser) statuses.push(await runSource(source, group))
  if (statuses.includes('Error')) process.exitCode = 1
}

if (process.argv[1]?.endsWith('scrape-all-jobs.ts') || process.argv[1]?.endsWith('scrape-all-jobs.js')) {
  main().catch(error => { console.error('Scraper orchestration failed:', error); process.exitCode = 1 })
}
