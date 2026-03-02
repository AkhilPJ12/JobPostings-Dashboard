/**
 * Accenture Jobs Scraper
 *
 * Uses Accenture elastic API at /api/accenture/elastic/findjobs
 * with required multipart payload.
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
    companyName: 'Accenture',
    dateWindowDays: 14,
    maxPages: 80,
    pageSize: 20,
}

type AccentureApiJob = {
    title?: string
    requisitionId?: string
    guid?: string
    updateDate?: string
    jobDetailUrl?: string
    location?: string[]
    feedCity?: string
    businessArea?: string
    function?: string[]
    employeeType?: string
    jobScheduleDescription?: string
    jobTypeDescription?: string
    jobDescription?: string
    jobDescriptionClean?: string
    qualification?: string
    qualificationClean?: string
    additionalInformation?: string
    postedDateText?: string
}

function parseAccenturePostedDate(postedDateText: string | undefined, updateDate: string | undefined): string | null {
    const raw = (postedDateText || '').trim()
    if (raw) {
        const today = /posted\s+today/i.test(raw)
        if (today) return new Date().toISOString().split('T')[0]

        const yesterday = /posted\s+yesterday/i.test(raw)
        if (yesterday) {
            const d = new Date()
            d.setDate(d.getDate() - 1)
            return d.toISOString().split('T')[0]
        }

        const daysAgo = raw.match(/posted\s+(\d+)\s+days?\s+ago/i)
        if (daysAgo) {
            const d = new Date()
            d.setDate(d.getDate() - Number(daysAgo[1]))
            return d.toISOString().split('T')[0]
        }

        const absolute = raw.replace(/^posted\s+/i, '').replace(/^on\s+/i, '').trim()
        const parsedAbsolute = parsePostedDate(absolute)
        if (parsedAbsolute) return parsedAbsolute
    }

    return parsePostedDate(updateDate || null)
}

function toListLocation(value: string[] | string | undefined): string {
    if (Array.isArray(value) && value.length) return value.join(', ')
    if (typeof value === 'string' && value.trim()) return value.trim()
    return 'United States'
}

async function scrapeAccentureJobs() {
    console.log(`🚀 Accenture Jobs Scraper`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: USA\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://www.accenture.com/us-en/careers/jobsearch'
    console.log(`🔗 Career URL: ${careerUrl}`)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        await page.goto(careerUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await sleep(2500)

        const collectedJobs: DbJob[] = []
        const seenIds = new Set<string>()

        let totalHits = 0
        let stalePages = 0

        for (let pageNum = 0; pageNum < CONFIG.maxPages; pageNum++) {
            const startIndex = pageNum * CONFIG.pageSize
            console.log(`📄 Page ${pageNum + 1} (startIndex=${startIndex})...`)

            const result = await page.evaluate(async ({ startIndex, pageSize }) => {
                const form = new FormData()
                form.set('startIndex', String(startIndex))
                form.set('maxResultSize', String(pageSize))
                form.set('jobKeyword', '')
                form.set('jobCountry', 'USA')
                form.set('jobLanguage', 'en')
                form.set('countrySite', 'us-en')
                form.set('sortBy', '2')
                form.set('searchType', 'vectorSearch')
                form.set('enableQueryBoost', 'true')
                form.set('minScore', '0.0')

                const resp = await fetch('/api/accenture/elastic/findjobs', {
                    method: 'POST',
                    body: form,
                })

                if (!resp.ok) {
                    return { ok: false, status: resp.status, data: [] as AccentureApiJob[], totalHits: 0 }
                }

                const json = await resp.json() as { data?: AccentureApiJob[]; totalHits?: number }
                return {
                    ok: true,
                    status: resp.status,
                    data: json.data || [],
                    totalHits: json.totalHits ?? 0,
                }
            }, { startIndex, pageSize: CONFIG.pageSize }) as {
                ok: boolean
                status: number
                data: AccentureApiJob[]
                totalHits: unknown
            }

            if (!result.ok) {
                console.log(`   ⚠️ API error ${result.status}. Stopping.`)
                break
            }

            if (pageNum === 0) {
                if (typeof result.totalHits === 'number') {
                    totalHits = result.totalHits
                } else if (result.totalHits && typeof result.totalHits === 'object' && 'value' in (result.totalHits as Record<string, unknown>)) {
                    totalHits = Number((result.totalHits as Record<string, unknown>).value || 0)
                } else {
                    totalHits = 0
                }
                console.log(`📊 Total matching jobs: ${totalHits}`)
            }

            if (!result.data.length) {
                console.log('📭 No more jobs. Done.')
                break
            }

            let newJobs = 0
            let dateSkipped = 0

            for (const r of result.data) {
                const reqId = String(r.requisitionId || r.guid || '').trim()
                if (!reqId || seenIds.has(reqId)) continue
                seenIds.add(reqId)

                const postedDate = parseAccenturePostedDate(r.postedDateText, r.updateDate)
                if (!postedDate) {
                    dateSkipped++
                    continue
                }
                if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                    dateSkipped++
                    continue
                }

                const title = (r.title || '').trim()
                if (!title) continue

                const location = toListLocation(r.location || r.feedCity)
                const detailUrlRaw = r.jobDetailUrl || ''
                const jobUrl = detailUrlRaw
                    ? detailUrlRaw.replace('{0}', 'us-en')
                    : `https://www.accenture.com/us-en/careers/jobdetails?id=${reqId}_en`

                const description = cleanHtml([
                    r.jobDescriptionClean || r.jobDescription || '',
                    r.qualificationClean || r.qualification || '',
                    r.additionalInformation || '',
                ].filter(Boolean).join('\n\n'))

                const department = [
                    r.businessArea || '',
                    ...(Array.isArray(r.function) ? r.function : []),
                ].filter(Boolean).join(' / ') || 'General'

                const fullText = `${title}\n${description}\n${location}`

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `accenture_${reqId}`,
                    title: title.slice(0, 240),
                    location: location.slice(0, 240),
                    location_type: determineLocationType(location, description),
                    department: department.slice(0, 240),
                    employment_type: determineEmploymentType(`${r.employeeType || r.jobScheduleDescription || r.jobTypeDescription || ''} ${title}`),
                    posted_date: postedDate,
                    description,
                    summary: createSummary(description),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: extractPayRange(description),
                    security_clearance: detectSecurityClearance(fullText),
                    h1b_sponsorship: detectH1BSponsorship(fullText),
                    job_url: jobUrl,
                    is_active: true,
                }

                collectedJobs.push(job)
                newJobs++
            }

            console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

            if (newJobs === 0 && dateSkipped >= result.data.length) {
                stalePages++
                if (stalePages >= 3) {
                    console.log('📭 Consecutive out-of-range pages reached. Stopping early.')
                    break
                }
            } else {
                stalePages = 0
            }

            if (result.data.length < CONFIG.pageSize) {
                console.log('📭 Last page reached. Done.')
                break
            }

            if (totalHits > 0 && startIndex + CONFIG.pageSize >= totalHits) {
                console.log('📭 Reached total hit count. Done.')
                break
            }

            await sleep(randomDelay(1000, 2200))
        }

        console.log(`\n📊 Total jobs collected: ${collectedJobs.length}`)

        if (collectedJobs.length === 0) {
            console.log('⚠️  No jobs found with valid posting dates.')
            return
        }

        console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
        const upsertedCount = await upsertJobsBatch(collectedJobs)
        const dbCount = await getCompanyJobCount(company.id)
        logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, careerUrl)
    } finally {
        await browser.close()
    }
}

scrapeAccentureJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
