/**
 * Master Job Scraper Runner
 *
 * Runs all company job scrapers sequentially.
 * Can also run individual scrapers by passing company name as argument.
 *
 * Usage:
 *   npx tsx scripts/scrape-all-jobs.ts           # Run all scrapers
 *   npx tsx scripts/scrape-all-jobs.ts microsoft  # Run single scraper
 */

import { execSync } from 'child_process'
import * as path from 'path'

const SCRAPERS = [
    { name: 'Amazon', script: 'scrape-amazon-jobs.ts' },
    { name: 'Microsoft', script: 'scrape-pcsx-jobs.ts', args: 'microsoft' },
    { name: 'Nvidia', script: 'scrape-pcsx-jobs.ts', args: 'nvidia' },
    { name: 'Google', script: 'scrape-google-jobs.ts' },
    { name: 'Meta', script: 'scrape-meta-jobs.ts' },
    { name: 'Apple', script: 'scrape-apple-jobs.ts' },
    { name: 'IBM', script: 'scrape-ibm-jobs.ts' },
    { name: 'Salesforce', script: 'scrape-salesforce-jobs.ts' },
    { name: 'Accenture', script: 'scrape-accenture-jobs.ts' },
    { name: 'Visa', script: 'scrape-visa-jobs.ts' },
    { name: 'JPMorgan Chase', script: 'scrape-jpmorgan-jobs.ts' },
    { name: 'Deloitte', script: 'scrape-deloitte-jobs.ts' },
]

interface ScraperResult {
    name: string
    success: boolean
    duration: number
    error?: string
}

async function runScraper(scraper: typeof SCRAPERS[0]): Promise<ScraperResult> {
    const start = Date.now()
    const scriptPath = path.join(__dirname, scraper.script)
    const cmd = `npx tsx ${scriptPath}${scraper.args ? ` ${scraper.args}` : ''}`

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`🏢 Running ${scraper.name} scraper...`)
    console.log(`   Command: ${cmd}`)
    console.log(`${'═'.repeat(60)}\n`)

    try {
        execSync(cmd, {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '..'),
            timeout: 600000, // 10 minute timeout per scraper
        })

        const duration = Math.round((Date.now() - start) / 1000)
        return { name: scraper.name, success: true, duration }
    } catch (error) {
        const duration = Math.round((Date.now() - start) / 1000)
        return {
            name: scraper.name,
            success: false,
            duration,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

async function main() {
    const filterArg = process.argv[2]?.toLowerCase()

    let scrapersToRun = SCRAPERS

    if (filterArg) {
        const matched = SCRAPERS.filter(s =>
            s.name.toLowerCase().includes(filterArg) ||
            s.script.toLowerCase().includes(filterArg)
        )
        if (matched.length === 0) {
            console.error(`❌ No scraper found matching: ${filterArg}`)
            console.log(`Available scrapers: ${SCRAPERS.map(s => s.name).join(', ')}`)
            process.exit(1)
        }
        scrapersToRun = matched
    }

    console.log(`🚀 Job Scraper Master Runner`)
    console.log(`📋 Running ${scrapersToRun.length} scraper(s): ${scrapersToRun.map(s => s.name).join(', ')}`)
    console.log(`📅 Started: ${new Date().toLocaleString()}\n`)

    const results: ScraperResult[] = []

    for (const scraper of scrapersToRun) {
        const result = await runScraper(scraper)
        results.push(result)

        if (result.success) {
            console.log(`\n✅ ${result.name}: Completed in ${result.duration}s`)
        } else {
            console.log(`\n❌ ${result.name}: Failed after ${result.duration}s`)
            console.log(`   Error: ${result.error?.slice(0, 200)}`)
        }
    }

    // Print summary
    console.log(`\n\n${'═'.repeat(60)}`)
    console.log(`📊 MASTER SUMMARY`)
    console.log(`${'═'.repeat(60)}`)
    console.log(`📅 Completed: ${new Date().toLocaleString()}`)
    console.log(``)

    const succeeded = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    console.log(`✅ Succeeded: ${succeeded.length}/${results.length}`)
    for (const r of succeeded) {
        console.log(`   ✅ ${r.name} (${r.duration}s)`)
    }

    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}/${results.length}`)
        for (const r of failed) {
            console.log(`   ❌ ${r.name}: ${r.error?.slice(0, 100)}`)
        }
    }

    console.log(`\n⏱️  Total runtime: ${Math.round(totalDuration / 60)}m ${totalDuration % 60}s`)
    console.log(`${'═'.repeat(60)}`)

    if (failed.length > 0) process.exit(1)
}

main().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
