/**
 * JPMorgan Chase Jobs Scraper (Oracle HCM API)
 *
 * Uses Oracle Candidate Experience API and requires real `PostedDate`.
 * Jobs without parsable posting dates are skipped.
 */

import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
} from './scraper-utils'

const CONFIG = {
    companyName: 'JPMorgan Chase',
    dateWindowDays: 14,
    pageSize: 25,
    maxPages: 120,
}

type WorkLocation = {
    TownOrCity?: string
    Region2?: string
    Country?: string
}

type Requisition = {
    Id?: string
    Title?: string
    PostedDate?: string
    PrimaryLocation?: string
    PrimaryLocationCountry?: string
    Department?: string
    JobFamily?: string
    JobType?: string
    WorkerType?: string
    ContractType?: string
    ShortDescriptionStr?: string
    ExternalResponsibilitiesStr?: string
    ExternalQualificationsStr?: string
    workLocation?: WorkLocation[]
}

function buildEndpoint(limit: number, offset: number): string {
    const finder = [
        'findReqs;siteNumber=CX_1001',
        'facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS',
        `limit=${limit}`,
        `offset=${offset}`,
        'lastSelectedFacet=POSTING_DATES',
        'locationId=300000000289738',
        'selectedPostingDatesFacet=14',
        'sortBy=POSTING_DATES_DESC',
    ].join(',')

    return `https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=${finder}`
}

function buildLocation(job: Requisition): string {
    if (job.PrimaryLocation) return job.PrimaryLocation
    const wl = job.workLocation?.[0]
    if (!wl) return 'United States'
    return [wl.TownOrCity, wl.Region2, wl.Country].filter(Boolean).join(', ') || 'United States'
}

async function scrapeJPMorganJobs() {
    console.log(`🚀 JPMorgan Chase Jobs Scraper (API)`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: United States, newest first\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs'
    console.log(`🔗 Career URL: ${careerUrl}`)

    const seenIds = new Set<string>()
    let totalCollected = 0
    let totalUpserted = 0

    for (let page = 0; page < CONFIG.maxPages; page++) {
        const offset = page * CONFIG.pageSize
        console.log(`📄 Page ${page + 1} (offset=${offset})...`)

        const endpoint = buildEndpoint(CONFIG.pageSize, offset)
        const resp = await fetch(endpoint, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
        })

        if (!resp.ok) {
            console.log(`   ⚠️ API error ${resp.status}. Stopping.`)
            break
        }

        const data = await resp.json() as { items?: { requisitionList?: Requisition[] }[] }
        const reqs = data.items?.[0]?.requisitionList || []

        if (reqs.length === 0) {
            console.log('📭 No more requisitions. Done.')
            break
        }

        let newJobs = 0
        let dateSkipped = 0
        const pageJobs: DbJob[] = []

        for (const j of reqs) {
            const id = j.Id
            const title = (j.Title || '').trim()
            if (!id || !title || seenIds.has(id)) continue
            seenIds.add(id)

            const postedDate = parsePostedDate(j.PostedDate || null)
            if (!postedDate) {
                dateSkipped++
                continue
            }
            if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                dateSkipped++
                continue
            }

            const location = buildLocation(j)
            const country = (j.PrimaryLocationCountry || '').toUpperCase()
            if (country && country !== 'US') continue

            const description = cleanHtml([
                j.ShortDescriptionStr || '',
                j.ExternalResponsibilitiesStr || '',
                j.ExternalQualificationsStr || '',
            ].join('\n\n'))

            const dept = j.Department || j.JobFamily || 'General'
            const fullText = `${title}\n${description}`

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `jpmorgan_${id}`,
                title,
                location,
                location_type: determineLocationType(location, description),
                department: dept,
                employment_type: determineEmploymentType(j.WorkerType || j.JobType || j.ContractType || title),
                posted_date: postedDate,
                description,
                summary: createSummary(description),
                required_qualifications: [],
                preferred_qualifications: [],
                pay_range: extractPayRange(description),
                security_clearance: detectSecurityClearance(fullText),
                h1b_sponsorship: detectH1BSponsorship(fullText),
                job_url: `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${id}`,
                is_active: true,
            }

            pageJobs.push(job)
            newJobs++
        }

        totalCollected += pageJobs.length

        if (pageJobs.length > 0) {
            const upserted = await upsertJobsBatch(pageJobs)
            totalUpserted += upserted
        }

        console.log(`   ✅ ${newJobs} new jobs (${totalCollected} total), ${dateSkipped} date-skipped`)

        if (newJobs === 0 && dateSkipped > 0) {
            console.log('📭 Reached jobs older than date window. Done.')
            break
        }

        if (reqs.length < CONFIG.pageSize) {
            console.log('📭 Last page reached. Done.')
            break
        }

        const delay = randomDelay(1200, 2500)
        await sleep(delay)
    }

    console.log(`\n📊 Total jobs collected: ${totalCollected}`)

    if (totalCollected === 0) {
        console.log('⚠️  No jobs found with valid posting dates.')
        return
    }

    console.log(`\n🗄️  Upsert complete during pagination.`)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, totalCollected, totalUpserted, dbCount, careerUrl)
}

scrapeJPMorganJobs().catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
