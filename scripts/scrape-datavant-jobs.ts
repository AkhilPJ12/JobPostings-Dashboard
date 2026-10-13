import { fetchSource } from '../lib/modules/ingestion/http'
/**
 * Datavant Jobs Scraper
 *
 * Uses Greenhouse public API (no browser needed).
 * Board token: datavant2
 * API: https://boards-api.greenhouse.io/v1/boards/datavant2/jobs?content=true
 *
 * Has `first_published` for posting date and full HTML content.
 *
 * Usage: pnpm exec tsx scripts/scrape-datavant-jobs.ts
 */

import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, isUSLocation, cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment, parseDescriptionQualifications,
    withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Datavant',
    dateWindowDays: 14,
    boardToken: 'datavant2',
}

type GreenhouseJob = {
    id: number
    title: string
    content: string
    first_published: string | null
    updated_at: string
    location: { name: string } | null
    departments: { name: string }[]
    offices: { name: string }[]
    absolute_url: string
}

async function scrapeDatevantJobs() {
    console.log(`🚀 Datavant Jobs Scraper (Greenhouse API)`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${CONFIG.boardToken}/jobs?content=true`
    console.log(`🔗 API URL: ${apiUrl}`)

    const resp = await fetchSource(apiUrl)
    if (!resp.ok) {
        throw new Error(`API error: ${resp.status}`)
    }

    const data = await resp.json() as { jobs: GreenhouseJob[] }
    console.log(`📊 Total jobs from API: ${data.jobs?.length || 0}`)

    const collectedJobs: DbJob[] = []
    let dateSkipped = 0
    let locationSkipped = 0

    for (const j of data.jobs || []) {
        const sourcePostedDate = j.first_published ? j.first_published.slice(0, 10) : null
        const postedDate = sourcePostedDate || new Date().toISOString().slice(0, 10)

        if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
            dateSkipped++
            continue
        }

        const location = j.location?.name || 'Remote'
        const officeNames = j.offices?.map(o => o.name).join(', ') || ''
        const fullLocation = officeNames || location

        if (!isUSLocation(fullLocation) && !fullLocation.toLowerCase().includes('remote')) {
            locationSkipped++
            continue
        }

        const contentText = cleanHtml(j.content || '')
        const quals = parseDescriptionQualifications(contentText)
        const department = j.departments?.[0]?.name || 'General'
        const fullText = [j.title, fullLocation, contentText].join('\n')

        const job: DbJob = {
            company_id: company.id,
            external_job_id: `datavant_${j.id}`,
            title: j.title.slice(0, 250),
            location: fullLocation.slice(0, 250),
            location_type: determineLocationType(fullLocation, contentText),
            department: normalizeDepartment(department, j.title),
            employment_type: determineEmploymentType(j.title),
            posted_date: postedDate,
            sourceDateProvenance: sourcePostedDate ? 'source' : 'first_seen',
            description: contentText || `${j.title} at Datavant - ${fullLocation}`,
            summary: `${j.title} at Datavant - ${fullLocation}`.slice(0, 250),
            required_qualifications: quals.required,
            preferred_qualifications: quals.preferred,
            pay_range: extractPayRange(fullText),
            security_clearance: detectSecurityClearance(fullText),
            h1b_sponsorship: detectH1BSponsorship(fullText),
            structuredSourceFields: { department: j.departments?.[0]?.name || null },
            job_url: j.absolute_url || `https://www.datavant.com/about/careers/open-roles/job?gh_jid=${j.id}`,
            is_active: true,
        }
        collectedJobs.push(job)
    }

    console.log(`\n📊 Results:`)
    console.log(`   Collected: ${collectedJobs.length}`)
    console.log(`   Date-skipped: ${dateSkipped}`)
    console.log(`   Location-skipped: ${locationSkipped}`)

    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs into Supabase...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount,
        company.careers_url || 'https://www.datavant.com/about/careers/open-roles')
}

withScraperRun(CONFIG.companyName, scrapeDatevantJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
