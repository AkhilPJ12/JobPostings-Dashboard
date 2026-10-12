import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Goldman Sachs Jobs Scraper
 *
 * Uses the GraphQL API at api-higher.gs.com.
 * No posted dates available — uses first-seen date pattern.
 * Detail pages at higher.gs.com/roles/{sourceId} have salary but no date.
 *
 * Usage: pnpm exec tsx scripts/scrape-goldmansachs-jobs.ts
 */

import { chromium } from 'playwright'
import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Goldman Sachs',
    pageSize: 20,
    maxPages: 15, // 20 × 15 = 300 most recent jobs
}

const GRAPHQL_URL = 'https://api-higher.gs.com/gateway/api/v1/graphql'

const SEARCH_QUERY = `query GetRoles($searchQueryInput: RoleSearchQueryInput!) {
  roleSearch(searchQueryInput: $searchQueryInput) {
    totalCount
    items {
      roleId
      corporateTitle
      jobTitle
      jobFunction
      locations {
        primary
        state
        country
        city
        __typename
      }
      status
      division
      skills
      jobType {
        code
        description
        __typename
      }
      externalSource {
        sourceId
        __typename
      }
      __typename
    }
    __typename
  }
}`

type GSRole = {
    roleId: string
    corporateTitle: string
    jobTitle: string
    jobFunction: string
    locations: { primary: boolean; state: string; country: string; city: string }[]
    status: string
    division: string
    skills: string[]
    externalSource: { sourceId: string }
}

async function scrapeGoldmanSachsJobs() {
    console.log(`🚀 Goldman Sachs Jobs Scraper (GraphQL API)`)
    console.log(`📅 Using first-seen date (no posting dates available)\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    // Parse filters from the careers_url
    const careerUrl = company.careers_url || ''
    const urlFilters = parseGSFilters(careerUrl)
    console.log(`🔗 Filters: ${JSON.stringify(urlFilters.map(f => f.filterCategoryType + ':' + f.filters.length))}`)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })

    try {
    // Load the page first to get cookies/session
    const page = await context.newPage()
    await navigateSource(page, 'https://higher.gs.com/results?JOB_FUNCTION=Software+Engineering&page=1&sort=POSTED_DATE', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(5000)

    const today = new Date().toISOString().split('T')[0]
    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()

    for (let pageNum = 0; pageNum < CONFIG.maxPages; pageNum++) {
        console.log(`📄 Page ${pageNum + 1}...`)

        const variables = {
            searchQueryInput: {
                page: { pageSize: CONFIG.pageSize, pageNumber: pageNum },
                sort: { sortStrategy: 'POSTED_DATE', sortOrder: 'DESC' },
                filters: urlFilters,
                experiences: ['EARLY_CAREER', 'PROFESSIONAL'],
                searchTerm: '',
            },
        }

        try {
            const data = await page.evaluate(async (args) => {
                const resp = await fetch(args.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ operationName: 'GetRoles', variables: args.variables, query: args.query }),
                })
                if (!resp.ok) return null
                return await resp.json()
            }, { url: GRAPHQL_URL, variables: JSON.parse(JSON.stringify(variables)), query: SEARCH_QUERY }) as { data: { roleSearch: { totalCount: number; items: GSRole[] } } } | null

            if (!data) {
                console.log(`   ⚠️ API error`)
                break
            }
            const items = data.data?.roleSearch?.items || []

            if (items.length === 0) {
                console.log('   📭 No more jobs. Done.')
                break
            }

            if (pageNum === 0) console.log(`   Total available: ${data.data?.roleSearch?.totalCount}`)

            let added = 0
            for (const role of items) {
                const sourceId = role.externalSource?.sourceId || role.roleId
                if (seenIds.has(sourceId)) continue
                seenIds.add(sourceId)

                const loc = role.locations?.find(l => l.primary) || role.locations?.[0]
                const location = loc ? `${loc.city}, ${loc.state}` : 'United States'

                // Filter to US only
                if (loc?.country && !loc.country.includes('United States')) continue

                const job: DbJob = {
                    company_id: company.id,
                    external_job_id: `gs_${sourceId}`,
                    title: role.jobTitle.slice(0, 250),
                    location: location.slice(0, 250),
                    location_type: determineLocationType(location),
                    department: normalizeDepartment(role.division || 'General', role.jobTitle),
                    employment_type: determineEmploymentType(role.jobTitle),
                    posted_date: today,
                    description: `${role.jobTitle} at Goldman Sachs - ${role.division} - ${location}. Level: ${role.corporateTitle}`,
                    summary: `${role.jobTitle} at Goldman Sachs - ${location}`.slice(0, 250),
                    required_qualifications: [],
                    preferred_qualifications: [],
                    pay_range: '',
                    security_clearance: 'N/A',
                    h1b_sponsorship: 'N/A',
                    structuredSourceFields: { department: role.division || null },
                    job_url: `https://higher.gs.com/roles/${sourceId}`,
                    is_active: true,
                }
                collectedJobs.push(job)
                added++
            }
            console.log(`   ✅ ${added} US jobs (${collectedJobs.length} total)`)

        } catch (err) {
            console.error(`   ❌ Error:`, err)
            break
        }

        await sleep(randomDelay(500, 1200))
    }

    console.log(`\n📊 Total: ${collectedJobs.length} jobs`)
    if (collectedJobs.length === 0) { console.log('⚠️  No jobs found.'); return }

    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs (preserving first-seen dates)...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs, 50, true)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount,
        company.careers_url || 'https://higher.gs.com/')
    } finally {
        await browser.close()
    }
}

function parseGSFilters(url: string): { filterCategoryType: string; filters: { filter: string; subFilters: never[] }[] }[] {
    const filters: { filterCategoryType: string; filters: { filter: string; subFilters: never[] }[] }[] = []
    try {
        const parsed = new URL(url)
        const jobFunctions = parsed.searchParams.get('JOB_FUNCTION')
        if (jobFunctions) {
            filters.push({
                filterCategoryType: 'JOB_FUNCTION',
                filters: jobFunctions.split('|').map(f => ({ filter: f, subFilters: [] })),
            })
        }
        // LOCATION filter uses nested state/city format in the API which doesn't
        // match the flat city names in the URL. Skip it — filter US in code instead.
    } catch {}
    return filters
}

withScraperRun(CONFIG.companyName, scrapeGoldmanSachsJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
