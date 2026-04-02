/**
 * Master Job Scraper Runner
 *
 * Runs all company job scrapers sequentially.
 * Can also run individual scrapers by passing company name as argument.
 *
 * Usage:
 *   npx tsx scripts/scrape-all-jobs.ts            # Run all scrapers
 *   npx tsx scripts/scrape-all-jobs.ts microsoft  # Run single scraper
 */

import { spawn } from 'child_process'
import * as path from 'path'
import { supabase, cleanupOldJobs, purgeInactiveJobs } from './scraper-utils'

// Each scraper is tagged as 'api' (no Playwright) or 'browser' (needs Playwright).
// API scrapers run in parallel first, then browser scrapers run sequentially.
const SCRAPERS = [
    // API-only scrapers (no browser — run in parallel for speed)
    { name: 'Amazon', script: 'scrape-amazon-jobs.ts', type: 'api' as const },
    { name: 'IBM', script: 'scrape-ibm-jobs.ts', type: 'api' as const },
    { name: 'Visa', script: 'scrape-visa-jobs.ts', type: 'api' as const },
    { name: 'JPMorgan Chase', script: 'scrape-jpmorgan-jobs.ts', type: 'api' as const },
    { name: 'Datavant', script: 'scrape-datavant-jobs.ts', type: 'api' as const },
    { name: 'Anthropic', script: 'scrape-anthropic-jobs.ts', type: 'api' as const },
    { name: 'OpenAI', script: 'scrape-openai-jobs.ts', type: 'api' as const },
    // Browser scrapers (need Playwright — run sequentially)
    { name: 'Microsoft', script: 'scrape-pcsx-jobs.ts', args: ['microsoft'], type: 'browser' as const },
    { name: 'Nvidia', script: 'scrape-pcsx-jobs.ts', args: ['nvidia'], type: 'browser' as const },
    { name: 'Google', script: 'scrape-google-jobs.ts', type: 'browser' as const },
    { name: 'Meta', script: 'scrape-meta-jobs.ts', type: 'browser' as const },
    { name: 'Apple', script: 'scrape-apple-jobs.ts', type: 'browser' as const },
    { name: 'Salesforce', script: 'scrape-salesforce-jobs.ts', type: 'browser' as const },
    { name: 'Accenture', script: 'scrape-accenture-jobs.ts', type: 'browser' as const },
    { name: 'Deloitte', script: 'scrape-deloitte-jobs.ts', type: 'browser' as const },
    { name: 'CVS', script: 'scrape-workday-jobs.ts', args: ['CVS'], type: 'browser' as const },
    { name: 'AT&T', script: 'scrape-workday-jobs.ts', args: ['AT&T'], type: 'browser' as const },
    { name: 'Walmart', script: 'scrape-workday-jobs.ts', args: ['Walmart'], type: 'browser' as const },
    { name: 'CarMax', script: 'scrape-workday-jobs.ts', args: ['CarMax'], type: 'browser' as const },
    { name: 'Texas Instruments', script: 'scrape-ti-jobs.ts', type: 'browser' as const },
    { name: 'Staples', script: 'scrape-staples-jobs.ts', type: 'browser' as const },
    { name: 'Intuit', script: 'scrape-intuit-jobs.ts', type: 'browser' as const },
    { name: 'Wellsfargo', script: 'scrape-wellsfargo-jobs.ts', type: 'browser' as const },
    { name: 'Infosys', script: 'scrape-infosys-jobs.ts', type: 'browser' as const },
    { name: 'Goldman Sachs', script: 'scrape-goldmansachs-jobs.ts', type: 'browser' as const },
    { name: 'Wipro', script: 'scrape-wipro-jobs.ts', type: 'browser' as const },
]

type RunStatus = 'Successful' | 'Error' | 'Partial'

interface ScraperResult {
    name: string
    status: RunStatus
    success: boolean
    duration: number
    error?: string
}

interface CommandResult {
    code: number | null
    output: string
    errorOutput: string
    timedOut: boolean
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        let errorOutput = ''
        let timedOut = false

        const timer = setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
        }, timeoutMs)

        child.stdout.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            output += text
            process.stdout.write(text)
        })

        child.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            errorOutput += text
            process.stderr.write(text)
        })

        child.on('close', (code) => {
            clearTimeout(timer)
            resolve({ code, output, errorOutput, timedOut })
        })
    })
}

function deriveStatus(result: CommandResult): RunStatus {
    if (result.timedOut) return 'Partial'
    if (result.code !== 0) return 'Error'

    const combined = `${result.output}\n${result.errorOutput}`
    if (/No jobs found/i.test(combined) || /with valid posting dates/i.test(combined)) {
        return 'Partial'
    }
    return 'Successful'
}

async function persistRun(args: {
    companyName: string
    runGroupId: string
    status: RunStatus
    startedAt: string
    completedAt: string
    durationSeconds: number
    errorMessage: string | null
}) {
    // Delete existing row for this company, then insert new one
    await supabase
        .from('scraper_runs')
        .delete()
        .eq('company_name', args.companyName)

    const { error } = await supabase
        .from('scraper_runs')
        .insert({
            company_name: args.companyName,
            run_group_id: args.runGroupId,
            status: args.status,
            started_at: args.startedAt,
            completed_at: args.completedAt,
            duration_seconds: args.durationSeconds,
            error_message: args.errorMessage,
        })

    if (error) {
        console.warn(`⚠️ Could not persist run status for ${args.companyName}: ${error.message}`)
    }
}

async function runScraper(scraper: typeof SCRAPERS[0], runGroupId: string): Promise<ScraperResult> {
    const start = Date.now()
    const startedAt = new Date(start).toISOString()
    const scriptPath = path.join(__dirname, scraper.script)
    const args = ['tsx', scriptPath, ...(scraper.args || [])]
    const cmdLabel = `npx ${args.join(' ')}`

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`🏢 Running ${scraper.name} scraper...`)
    console.log(`   Command: ${cmdLabel}`)
    console.log(`${'═'.repeat(60)}\n`)

    const commandResult = await runCommand('npx', args, path.resolve(__dirname, '..'), 600000)
    const duration = Math.round((Date.now() - start) / 1000)
    const completedAt = new Date().toISOString()
    const status = deriveStatus(commandResult)
    const error = commandResult.code === 0 && !commandResult.timedOut
        ? undefined
        : (commandResult.errorOutput.trim() || `Process exited with code ${commandResult.code}`)

    await persistRun({
        companyName: scraper.name,
        runGroupId,
        status,
        startedAt,
        completedAt,
        durationSeconds: duration,
        errorMessage: error || null,
    })

    return {
        name: scraper.name,
        status,
        success: status !== 'Error',
        duration,
        error,
    }
}

async function main() {
    const filterArg = process.argv[2]?.toLowerCase()
    const runGroupId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    let scrapersToRun = SCRAPERS

    if (filterArg === '--api-only') {
        scrapersToRun = SCRAPERS.filter(s => s.type === 'api')
    } else if (filterArg === '--browser-only') {
        scrapersToRun = SCRAPERS.filter(s => s.type === 'browser')
    } else if (filterArg) {
        const matched = SCRAPERS.filter(s =>
            s.name.toLowerCase().includes(filterArg) ||
            s.script.toLowerCase().includes(filterArg)
        )
        if (matched.length === 0) {
            console.error(`❌ No scraper found matching: ${filterArg}`)
            console.log(`Available scrapers: ${SCRAPERS.map(s => s.name).join(', ')}`)
            console.log(`Flags: --api-only, --browser-only`)
            process.exit(1)
        }
        scrapersToRun = matched
    }

    console.log(`🚀 Job Scraper Master Runner`)
    console.log(`📋 Running ${scrapersToRun.length} scraper(s): ${scrapersToRun.map(s => s.name).join(', ')}`)
    console.log(`🧾 Run Group ID: ${runGroupId}`)
    console.log(`📅 Started: ${new Date().toLocaleString()}\n`)

    // Soft-delete jobs older than 14 days (marks is_active=false)
    await cleanupOldJobs(14)
    // Hard-delete jobs that have been inactive for 180+ days
    await purgeInactiveJobs(180)

    const results: ScraperResult[] = []
    const apiScrapers = scrapersToRun.filter(s => s.type === 'api')
    const browserScrapers = scrapersToRun.filter(s => s.type === 'browser')

    // Phase 1: Run API scrapers in parallel (no browser needed, fast)
    if (apiScrapers.length > 0) {
        console.log(`\n⚡ Phase 1: Running ${apiScrapers.length} API scrapers in parallel...`)
        const apiResults = await Promise.all(
            apiScrapers.map(s => runScraper(s, runGroupId))
        )
        for (const result of apiResults) {
            results.push(result)
            const icon = result.status === 'Successful' ? '✅' : result.status === 'Partial' ? '⚠️' : '❌'
            console.log(`${icon} ${result.name}: ${result.status} in ${result.duration}s`)
        }
    }

    // Phase 2: Run browser scrapers sequentially (share system resources)
    if (browserScrapers.length > 0) {
        console.log(`\n🌐 Phase 2: Running ${browserScrapers.length} browser scrapers sequentially...`)
        for (const scraper of browserScrapers) {
            const result = await runScraper(scraper, runGroupId)
            results.push(result)

            if (result.status === 'Successful') {
                console.log(`\n✅ ${result.name}: Successful in ${result.duration}s`)
            } else if (result.status === 'Partial') {
                console.log(`\n⚠️ ${result.name}: Partial in ${result.duration}s`)
            } else {
                console.log(`\n❌ ${result.name}: Failed after ${result.duration}s`)
                console.log(`   Error: ${result.error?.slice(0, 200)}`)
            }
        }
    }

    console.log(`\n\n${'═'.repeat(60)}`)
    console.log(`📊 MASTER SUMMARY`)
    console.log(`${'═'.repeat(60)}`)
    console.log(`📅 Completed: ${new Date().toLocaleString()}`)
    console.log(``)

    const successful = results.filter(r => r.status === 'Successful')
    const partial = results.filter(r => r.status === 'Partial')
    const failed = results.filter(r => r.status === 'Error')
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    console.log(`✅ Successful: ${successful.length}/${results.length}`)
    successful.forEach((r) => console.log(`   ✅ ${r.name} (${r.duration}s)`))

    if (partial.length > 0) {
        console.log(`\n⚠️ Partial: ${partial.length}/${results.length}`)
        partial.forEach((r) => console.log(`   ⚠️ ${r.name} (${r.duration}s)`))
    }

    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}/${results.length}`)
        failed.forEach((r) => console.log(`   ❌ ${r.name}: ${r.error?.slice(0, 100)}`))
    }

    console.log(`\n⏱️  Total runtime: ${Math.round(totalDuration / 60)}m ${totalDuration % 60}s`)
    console.log(`${'═'.repeat(60)}`)

    if (failed.length > 0) process.exit(1)
}

main().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
