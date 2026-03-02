/**
 * Deloitte Jobs Scraper
 *
 * Fallback policy:
 * 1) Scrape `careers_url` first
 * 2) If posted date is unavailable in job positions, try `careers_url_1`
 * 3) If still unavailable (or no careers_url_1), scrape first 20 pages and store
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Deloitte',
    dateWindowDays: 14,
    pageSize: 10,
    maxPages: 80,
    maxPagesNoDate: 20,
}

type ListCard = {
    id: string
    title: string
    url: string
    locationLine: string
}

type JobDetailData = {
    datePosted: string | null
    description: string
}

function parseLocationAndDepartment(line: string): { location: string; department: string } {
    const compact = line.replace(/\s+/g, ' ').trim()
    if (!compact) return { location: 'United States', department: 'General' }
    const parts = compact.split('|').map(p => p.trim()).filter(Boolean)
    return {
        location: parts.length > 0 ? parts[parts.length - 1] : compact,
        department: parts.length > 1 ? parts[1] : 'General',
    }
}

function buildListUrl(baseSearchUrl: string, offset: number): string {
    if (/jobOffset=\d+/i.test(baseSearchUrl)) {
        return baseSearchUrl.replace(/jobOffset=\d+/i, `jobOffset=${offset}`)
    }
    const sep = baseSearchUrl.includes('?') ? '&' : '?'
    return `${baseSearchUrl}${sep}jobOffset=${offset}`
}

function extractJobDetailData(html: string): JobDetailData {
    let datePosted: string | null = null
    let description = ''

    const regex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi
    let match: RegExpExecArray | null

    while ((match = regex.exec(html)) !== null) {
        const raw = match[1]?.trim()
        if (!raw) continue
        try {
            const parsed = JSON.parse(raw)
            const entries = Array.isArray(parsed) ? parsed : [parsed]
            for (const e of entries) {
                if (!e || typeof e !== 'object') continue
                const p = e as Record<string, unknown>
                if ((p['@type'] === 'JobPosting' || p['datePosted']) && !datePosted) {
                    datePosted = parsePostedDate(String(p['datePosted'] || ''))
                    if (typeof p['description'] === 'string') {
                        description = cleanHtml(p['description'])
                    }
                }
            }
        } catch {
            // Ignore malformed JSON-LD blobs.
        }
    }

    return { datePosted, description }
}

async function runDeloitteSource(
    companyId: number,
    sourceUrl: string,
    pages: number,
    requireDate: boolean,
) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
        const seenIds = new Set<string>()
        const collectedJobs: DbJob[] = []
        let hasAnyDate = false
        let stalePages = 0

        for (let pageNum = 1; pageNum <= pages; pageNum++) {
            const offset = (pageNum - 1) * CONFIG.pageSize
            const listUrl = buildListUrl(sourceUrl, offset)
            console.log(`📄 Page ${pageNum} (offset=${offset})...`)

            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(1400)

            const cards = await page.evaluate(() => {
                const nodes = Array.from(document.querySelectorAll('.article--result'))
                return nodes.map(node => {
                    const link = node.querySelector("a[href*='JobDetail']") as HTMLAnchorElement | null
                    const title = link?.textContent?.trim() || ''
                    const url = link?.href || ''
                    const idMatch = url.match(/\/(\d+)(?:\?|$)/)
                    const id = idMatch ? idMatch[1] : ''
                    const locationLine = (node.querySelector('.article__header--locations')?.textContent || '').trim()
                    return { id, title, url, locationLine }
                }).filter(j => j.id && j.title && j.url)
            }) as ListCard[]

            if (cards.length === 0) break

            let pageAdded = 0
            let pageDateSkipped = 0

            for (const c of cards) {
                if (seenIds.has(c.id)) continue
                seenIds.add(c.id)

                const resp = await context.request.get(c.url)
                if (!resp.ok()) continue

                const html = await resp.text()
                const detail = extractJobDetailData(html)
                if (detail.datePosted) hasAnyDate = true

                if (requireDate && (!detail.datePosted || !isWithinDaysOrFuture(detail.datePosted, CONFIG.dateWindowDays))) {
                    pageDateSkipped++
                    continue
                }

                const meta = parseLocationAndDepartment(c.locationLine)
                const description = detail.description || cleanHtml(c.title)
                const postedDate = detail.datePosted || new Date().toISOString().split('T')[0]
                const fullText = `${c.title}\n${description}`

                const job: DbJob = {
                    company_id: companyId,
                    external_job_id: `deloitte_${c.id}`,
                    title: c.title,
                    location: meta.location,
                    location_type: determineLocationType(meta.location, description),
                    department: meta.department,
                    employment_type: determineEmploymentType(c.title),
                    posted_date: postedDate,
                    description,
                    summary: createSummary(description),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(description),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: c.url,
                    is_active: true,
                }
                collectedJobs.push(job)
                pageAdded++
                await sleep(60)
            }

            console.log(`   ✅ ${pageAdded} new jobs (${collectedJobs.length} total), ${pageDateSkipped} date-skipped`)

            if (requireDate && pageAdded === 0 && pageDateSkipped >= cards.length) {
                stalePages++
                if (stalePages >= 3) {
                    console.log('📭 Consecutive out-of-range pages reached. Stopping early.')
                    break
                }
            } else {
                stalePages = 0
            }

            if (cards.length < CONFIG.pageSize) break
            await sleep(randomDelay(1000, 1800))
        }

        if (requireDate && !hasAnyDate) {
            return { hasDate: false, jobs: [] as DbJob[] }
        }
        return { hasDate: hasAnyDate, jobs: collectedJobs }
    } finally {
        await browser.close()
    }
}

async function scrapeDeloitteJobs() {
    console.log(`🚀 Deloitte Jobs Scraper`)
    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const primaryUrl = company.careers_url || 'https://apply.deloitte.com/en_US/careers/SearchJobs/?jobSort=relevancy&jobRecordsPerPage=10&jobOffset=0'
    const secondaryUrl = company.careers_url_1

    console.log(`🔗 Primary URL: ${primaryUrl}`)
    if (secondaryUrl) console.log(`🔁 Secondary URL: ${secondaryUrl}`)

    let sourceUrl = primaryUrl
    let result = await runDeloitteSource(company.id, primaryUrl, CONFIG.maxPages, true)

    if (!result.hasDate) {
        console.log('⚠️ No posting date in primary jobs.')
        if (secondaryUrl) {
            sourceUrl = secondaryUrl
            const second = await runDeloitteSource(company.id, secondaryUrl, CONFIG.maxPages, true)
            if (second.hasDate) {
                console.log('✅ Using secondary URL with posting dates.')
                result = second
            } else {
                console.log('⚠️ Secondary URL also has no posting dates. Using first 20 pages.')
                result = await runDeloitteSource(company.id, secondaryUrl, CONFIG.maxPagesNoDate, false)
            }
        } else {
            console.log('⚠️ No secondary URL. Using first 20 pages from primary URL.')
            result = await runDeloitteSource(company.id, primaryUrl, CONFIG.maxPagesNoDate, false)
        }
    }

    console.log(`📊 Total jobs collected: ${result.jobs.length}`)
    if (result.jobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    console.log(`🗄️  Upserting ${result.jobs.length} jobs...`)
    const upsertedCount = await upsertJobsBatch(result.jobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, result.jobs.length, upsertedCount, dbCount, sourceUrl)
}

scrapeDeloitteJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
