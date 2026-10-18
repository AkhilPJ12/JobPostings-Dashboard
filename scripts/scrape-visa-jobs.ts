import { fetchSource } from '../lib/modules/ingestion/http'
/**
 * Visa Jobs Scraper (API-based)
 *
 * Uses Visa search API directly and requires real posting dates (`createdOn`).
 * Jobs without parsable dates are skipped per project rule.
 */

import {
    DbJob, getCompany, upsertJobsBatch, getCompanyJobCount, logSummary,
    isWithinDaysOrFuture, parsePostedDate,
    cleanHtml, createSummary, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    sleep, randomDelay,
    withScraperRun, htmlToText, parseDescriptionQualifications,
    normalizeDepartment,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Visa',
    dateWindowDays: 14,
    pageSize: 100,
    maxPages: 30,
    defaultCities: [
        'Ashburn', 'Atlanta', 'Austin', 'Bellevue', 'Foster', 'Foster City',
        'Highlands Ranch', 'Lehi', 'Mentor', 'Miami', 'New York', 'Oakland',
        'San Francisco', 'San Juan', 'Washington', 'Wilmington',
    ],
}

type VisaApiJob = {
    refNumber?: string
    postingId?: string
    jobTitle?: string
    jobDescription?: string
    qualifications?: string
    additionalInformation?: string
    city?: string
    region?: string
    country?: string
    countryCode?: string
    createdOn?: string
    typeOfEmployment?: string
    applyUrl?: string
    department?: string
    function?: string
    superDepartment?: string
}

function extractCitiesFromCareerUrl(careerUrl: string): string[] {
    try {
        const url = new URL(careerUrl)
        const cities = url.searchParams.getAll('cities').map(c => c.trim()).filter(Boolean)
        return cities.length > 0 ? cities : CONFIG.defaultCities
    } catch {
        return CONFIG.defaultCities
    }
}

async function scrapeVisaJobs() {
    console.log(`🚀 Visa Jobs Scraper (API)`)
    console.log(`📅 Fetching jobs posted in the last ${CONFIG.dateWindowDays} days`)
    console.log(`🔍 Filters: US cities, newest first\n`)

    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const careerUrl = company.careers_url || 'https://corporate.visa.com/en/jobs/'
    console.log(`🔗 Career URL: ${careerUrl}`)
    const cities = extractCitiesFromCareerUrl(careerUrl)
    console.log(`🏙️ Cities filter (${cities.length}): ${cities.join(', ')}`)

    const endpoint = 'https://search.visa.com/CAREERS/careers/jobs?q='
    const collectedJobs: DbJob[] = []
    const seenIds = new Set<string>()
    let consecutiveNoNewPages = 0

    for (let page = 0; page < CONFIG.maxPages; page++) {
        const from = page * CONFIG.pageSize
        console.log(`📄 Page ${page + 1} (from=${from})...`)

        const resp = await fetchSource(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://corporate.visa.com',
                'Referer': careerUrl,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                city: cities,
                from,
                size: CONFIG.pageSize,
                sort: { createdOn: 'DESC' },
            }),
        })

        if (!resp.ok) {
            throw new Error(`API error ${resp.status} while paging Visa jobs`)
        }

        const data = await resp.json() as { jobDetails?: VisaApiJob[] }
        const rawJobs = data.jobDetails || []

        if (rawJobs.length === 0) {
            console.log('📭 No more jobs. Done.')
            break
        }

        let newJobs = 0
        let dateSkipped = 0

        for (const j of rawJobs) {
            const id = j.refNumber || j.postingId
            if (!id || seenIds.has(id)) continue
            seenIds.add(id)

            const country = (j.countryCode || j.country || '').toLowerCase()
            if (country && !['us', 'usa', 'united states', 'united states of america'].includes(country)) {
                continue
            }

            const postedDate = parsePostedDate(j.createdOn || null)
            if (!postedDate) {
                dateSkipped++
                continue
            }
            if (!isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
                dateSkipped++
                continue
            }

            const title = (j.jobTitle || '').trim()
            if (!title) continue

            const locationParts = [j.city, j.region, j.countryCode?.toUpperCase()].filter(Boolean)
            const location = locationParts.join(', ')

            const jobDesc = htmlToText(j.jobDescription || '')
            const qualText = htmlToText(j.qualifications || '')
            const additionalText = htmlToText(j.additionalInformation || '')

            const quals = parseDescriptionQualifications(qualText)

            // Use jobDescription as main description, append additional info
            const description = additionalText
                ? jobDesc + '\n\n---OTHER_INFO---\n' + additionalText
                : jobDesc

            const dept = j.superDepartment || j.department || j.function || 'General'
            const textForSignals = `${title}\n${jobDesc}\n${qualText}\n${additionalText}`

            const job: DbJob = {
                company_id: company.id,
                external_job_id: `visa_${id}`,
                title,
                location,
                location_type: determineLocationType(location, description),
                department: normalizeDepartment(dept, title),
                employment_type: determineEmploymentType(j.typeOfEmployment || title),
                posted_date: postedDate,
                description,
                summary: createSummary(jobDesc),
                required_qualifications: quals.required.length > 0 ? quals.required : [],
                preferred_qualifications: quals.preferred.length > 0 ? quals.preferred : [],
                pay_range: extractPayRange(description),
                security_clearance: detectSecurityClearance(textForSignals),
                h1b_sponsorship: detectH1BSponsorship(textForSignals),
                structuredSourceFields: { department: dept === 'General' ? null : dept },
                sourceHints: { employmentType: j.typeOfEmployment || '' },
                job_url: j.applyUrl || careerUrl,
                is_active: true,
            }

            collectedJobs.push(job)
            newJobs++
        }

        console.log(`   ✅ ${newJobs} new jobs (${collectedJobs.length} total), ${dateSkipped} date-skipped`)

        if (newJobs === 0) {
            consecutiveNoNewPages++
            if (consecutiveNoNewPages >= 3) {
                console.log('📭 No new jobs for multiple pages. Done.')
                break
            }
        } else {
            consecutiveNoNewPages = 0
        }

        if (rawJobs.length < CONFIG.pageSize) {
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

withScraperRun(CONFIG.companyName, scrapeVisaJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
