/**
 * OpenAI Jobs Scraper
 *
 * Uses Ashby public API (no browser needed).
 * API: https://api.ashbyhq.com/posting-api/job-board/openai
 * Has `publishedAt` for posting date and full description.
 *
 * Usage: npx tsx scripts/scrape-openai-jobs.ts
 */

import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, isUSLocation, cleanHtml, extractPayRange, truncateField,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment, parseDescriptionQualifications,
    withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'OpenAI',
    dateWindowDays: 14,
}

type AshbyJob = {
    id: string
    title: string
    department: string
    team: string
    employmentType: string
    location: string
    secondaryLocations: string[]
    publishedAt: string
    isRemote: boolean
    workplaceType: string
    jobUrl: string
    applyUrl: string
    descriptionHtml: string
    descriptionPlain: string
}

async function scrapeOpenAIJobs() {
    console.log(`🚀 OpenAI Jobs Scraper (Ashby API)`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const apiUrl = 'https://api.ashbyhq.com/posting-api/job-board/openai'
    console.log(`🔗 API URL: ${apiUrl}`)

    const resp = await fetch(apiUrl)
    if (!resp.ok) { console.error(`❌ API error: ${resp.status}`); return }

    const data = await resp.json() as { jobs: AshbyJob[] }
    console.log(`📊 Total jobs from API: ${data.jobs?.length || 0}`)

    const collectedJobs: DbJob[] = []
    let dateSkipped = 0, locationSkipped = 0

    for (const j of data.jobs || []) {
        const postedDate = j.publishedAt ? j.publishedAt.slice(0, 10) : null

        if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
            dateSkipped++; continue
        }

        const location = j.location || 'Remote'
        if (!isUSLocation(location) && !j.isRemote && !location.toLowerCase().includes('remote')) {
            locationSkipped++; continue
        }

        const contentText = cleanHtml(j.descriptionHtml || '') || j.descriptionPlain || ''
        const quals = parseDescriptionQualifications(contentText)
        const fullText = [j.title, location, contentText].join('\n')

        const locationType = j.isRemote || j.workplaceType === 'Remote'
            ? 'Remote'
            : j.workplaceType === 'Hybrid' ? 'Hybrid' : determineLocationType(location, contentText)

        collectedJobs.push({
            company_id: company.id,
            external_job_id: `openai_${j.id}`,
            title: truncateField(j.title),
            location: truncateField(location),
            location_type: locationType,
            department: normalizeDepartment(j.department || j.team || 'General', j.title),
            employment_type: determineEmploymentType(j.employmentType || j.title),
            posted_date: postedDate,
            description: contentText || `${j.title} at OpenAI - ${location}`,
            summary: truncateField(`${j.title} at OpenAI - ${location}`),
            required_qualifications: quals.required,
            preferred_qualifications: quals.preferred,
            pay_range: truncateField(extractPayRange(fullText)),
            security_clearance: detectSecurityClearance(fullText),
            h1b_sponsorship: detectH1BSponsorship(fullText),
            job_url: j.jobUrl || j.applyUrl || `https://openai.com/careers/`,
            is_active: true,
        })
    }

    console.log(`\n📊 Collected: ${collectedJobs.length} | Date-skipped: ${dateSkipped} | Location-skipped: ${locationSkipped}`)

    if (collectedJobs.length === 0) { console.log('⚠️  No jobs found.'); return }

    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount,
        company.careers_url || 'https://openai.com/careers/search/')
}

withScraperRun(CONFIG.companyName, scrapeOpenAIJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
