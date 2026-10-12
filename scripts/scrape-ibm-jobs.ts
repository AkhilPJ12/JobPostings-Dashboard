import { fetchSource } from '../lib/modules/ingestion/http'
/**
 * IBM Jobs Scraper (API-based)
 *
 * Uses IBM search API and requires a real posting timestamp from hit.sort[0] (dcdate).
 * Jobs without parsable posting dates are skipped.
 */

import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange, normalizeDepartment,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
    withScraperRun, parseDescriptionQualifications, htmlToText,
} from './scraper-utils'

const CONFIG = {
    companyName: 'IBM',
    dateWindowDays: 14,
    pageSize: 30,
    maxPages: 40,
    endpoint: 'https://www-api.ibm.com/search/api/v2',
}

type IbmHit = {
    _source?: {
        title?: string
        url?: string
        description?: string
        field_keyword_19?: string // location
        field_keyword_08?: string // department
    }
    sort?: Array<number | string>
}

function buildPayload(from: number, size: number) {
    return {
        appId: 'careers',
        scopes: ['careers2'],
        query: { bool: { must: [] } },
        post_filter: { term: { field_keyword_05: 'United States' } },
        aggs: {
            field_keyword_172: {
                filter: { term: { field_keyword_05: 'United States' } },
                aggs: {
                    field_keyword_17: { terms: { field: 'field_keyword_17', size: 6 } },
                    field_keyword_17_count: { cardinality: { field: 'field_keyword_17' } },
                },
            },
            field_keyword_083: {
                filter: { term: { field_keyword_05: 'United States' } },
                aggs: {
                    field_keyword_08: { terms: { field: 'field_keyword_08', size: 6 } },
                    field_keyword_08_count: { cardinality: { field: 'field_keyword_08' } },
                },
            },
            field_keyword_184: {
                filter: { term: { field_keyword_05: 'United States' } },
                aggs: {
                    field_keyword_18: { terms: { field: 'field_keyword_18', size: 6 } },
                    field_keyword_18_count: { cardinality: { field: 'field_keyword_18' } },
                },
            },
            field_keyword_055: {
                filter: { match_all: {} },
                aggs: {
                    field_keyword_05: { terms: { field: 'field_keyword_05', size: 1000 } },
                    field_keyword_05_count: { cardinality: { field: 'field_keyword_05' } },
                },
            },
        },
        size,
        from,
        sort: [{ dcdate: 'desc' }, { _score: 'desc' }],
        lang: 'zz',
        localeSelector: {},
        sm: { query: '', lang: 'zz' },
        _source: [
            '_id', 'title', 'url', 'description', 'language', 'entitled',
            'field_keyword_17', 'field_keyword_08', 'field_keyword_18', 'field_keyword_19',
        ],
    }
}

async function scrapeIBMJobs() {
    console.log(`🚀 IBM Jobs Scraper (API)`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: United States, newest first\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://www.ibm.com/careers/search?field_keyword_05[0]=United%20States&sort=dcdate_desc'
    console.log(`🔗 Career URL: ${careerUrl}`)

    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()

    for (let page = 0; page < CONFIG.maxPages; page++) {
        const from = page * CONFIG.pageSize
        console.log(`📄 Page ${page + 1} (from=${from})...`)

        const payload = buildPayload(from, CONFIG.pageSize)
        const resp = await fetchSource(CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://www.ibm.com',
                'Referer': careerUrl,
            },
            body: JSON.stringify(payload),
        })

        if (!resp.ok) {
            throw new Error(`API error ${resp.status} while paging IBM jobs`)
        }

        const data = await resp.json() as { hits?: { hits?: IbmHit[] } }
        const hits = data.hits?.hits || []

        if (hits.length === 0) {
            console.log('📭 No more jobs. Done.')
            break
        }

        let newJobs = 0
        let dateSkipped = 0

        for (const hit of hits) {
            const src = hit._source || {}
            const url = src.url || ''
            const idMatch = url.match(/jobId=(\d+)/i)
            const externalId = idMatch?.[1] || url || src.title || ''

            if (!externalId || seenIds.has(externalId)) continue
            seenIds.add(externalId)

            const postedTs = Number(hit.sort?.[0])
            const postedDate = Number.isFinite(postedTs) ? parsePostedDate(postedTs) : null
            if (!postedDate) {
                dateSkipped++
                continue
            }
            if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                dateSkipped++
                continue
            }

            const title = (src.title || '').trim()
            if (!title) continue

            const location = (src.field_keyword_19 || 'United States').trim()
            const rawDescription = src.description || ''
            const quals = parseDescriptionQualifications(htmlToText(rawDescription))
            const description = htmlToText(rawDescription)
            const fullText = `${title}\n${description}`

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `ibm_${externalId}`,
                title,
                location,
                location_type: determineLocationType(location, description),
                department: normalizeDepartment((src.field_keyword_08 || 'General').trim(), title),
                employment_type: determineEmploymentType(title),
                posted_date: postedDate,
                description,
                summary: createSummary(description),
                required_qualifications: quals.required,
                preferred_qualifications: quals.preferred,
                pay_range: extractPayRange(description),
                security_clearance: detectSecurityClearance(fullText),
                h1b_sponsorship: detectH1BSponsorship(fullText),
                structuredSourceFields: { department: src.field_keyword_08 || null },
                job_url: url || careerUrl,
                is_active: true,
            }

            collectedJobs.push(job)
            newJobs++
        }

        console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

        if (hits.length < CONFIG.pageSize) {
            console.log('📭 Last page reached. Done.')
            break
        }

        const delay = randomDelay(1200, 2500)
        await sleep(delay)
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
}

withScraperRun(CONFIG.companyName, scrapeIBMJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
