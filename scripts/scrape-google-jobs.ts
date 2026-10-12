import { navigateSource } from '../lib/modules/ingestion/browser'
/**
 * Google Jobs Scraper
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
    cleanHtml, extractPayRange,
    detectSecurityClearance, detectH1BSponsorship,
    determineLocationType, determineEmploymentType,
    normalizeDepartment,
    sleep, randomDelay, withScraperRun,
} from './scraper-utils'

const CONFIG = {
    companyName: 'Google',
    dateWindowDays: 14,
    maxPages: 150,
    maxPagesNoDate: 20,
}

type ExtractedJob = {
    id: string
    title: string
    location: string
    url: string
    text: string
    dateText: string
}

type GoogleJobDetail = {
    aboutTheJob: string
    responsibilities: string[]
    minQualifications: string[]
    prefQualifications: string[]
    payRange: string
}

/**
 * Parse structured sections from a Google job detail page's rendered text.
 * Sections are identified by headings: "Minimum qualifications:", "Preferred qualifications:",
 * "About the job", "Responsibilities".
 */
function parseGoogleDetailText(fullText: string): GoogleJobDetail {
    const result: GoogleJobDetail = {
        aboutTheJob: '',
        responsibilities: [],
        minQualifications: [],
        prefQualifications: [],
        payRange: '',
    }

    // Normalize whitespace but keep newlines
    const text = fullText.replace(/\r\n/g, '\n').replace(/\t/g, ' ')

    // Extract sections by looking for known headings
    const minQualStart = text.search(/Minimum qualifications\s*:?/i)
    const prefQualStart = text.search(/Preferred qualifications\s*:?/i)
    const aboutStart = text.search(/About the job/i)
    const respStart = text.search(/\nResponsibilities\s*\n/i)

    // Minimum qualifications
    if (minQualStart !== -1) {
        const endIdx = prefQualStart !== -1 ? prefQualStart : (aboutStart !== -1 ? aboutStart : text.length)
        const section = text.slice(minQualStart, endIdx)
            .replace(/^Minimum qualifications\s*:?\s*/i, '')
            .trim()
        result.minQualifications = section
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5)
    }

    // Preferred qualifications
    if (prefQualStart !== -1) {
        const endIdx = aboutStart !== -1 ? aboutStart : (respStart !== -1 ? respStart : text.length)
        const section = text.slice(prefQualStart, endIdx)
            .replace(/^Preferred qualifications\s*:?\s*/i, '')
            .trim()
        result.prefQualifications = section
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5)
    }

    // About the job
    if (aboutStart !== -1) {
        const endIdx = respStart !== -1 ? respStart : text.length
        let section = text.slice(aboutStart, endIdx)
            .replace(/^About the job\s*/i, '')
            .trim()

        // Extract pay/compensation info from the "About the job" section
        const payMatch = section.match(
            /(The\s+US\s+base\s+salary\s+range[\s\S]*?)(?=\n\s*Responsibilities|$)/i
        ) || section.match(
            /(Salary\s+Range[\s\S]*?)(?=\n\s*Responsibilities|$)/i
        )
        if (payMatch) {
            result.payRange = payMatch[1].trim()
            section = section.replace(payMatch[0], '').trim()
        }

        result.aboutTheJob = section.replace(/\n{3,}/g, '\n\n').trim()
    }

    // Responsibilities
    if (respStart !== -1) {
        let section = text.slice(respStart)
            .replace(/^\s*Responsibilities\s*/i, '')
            .trim()
        // Remove footer/legal boilerplate that appears after responsibilities
        section = section.replace(/\n\s*(?:Information collected and processed|Google is proud to be|If you have a need|Google is a global company|To all recruitment agencies|Apply\s*$)[\s\S]*/i, '').trim()
        result.responsibilities = section
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 10)
    }

    return result
}

function looksLikeDate(text: string): string | null {
    if (!text) return null
    const m = text.match(/(\b\w+\s+\d{1,2},\s*\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i)
    return m ? m[1] : null
}

function buildGooglePageUrl(baseUrl: string, pageNum: number): string {
    const url = new URL(baseUrl)
    const pageIndex = Math.max(0, pageNum - 1)
    if (pageIndex === 0) return url.toString()
    url.searchParams.set('page', String(pageIndex))
    url.searchParams.set('start', String(pageIndex * 20))
    return url.toString()
}

const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

async function runGoogleUrl(baseUrl: string, pages: number, requireDate: boolean, retryCount = 0): Promise<ReturnType<typeof _runGoogleUrl>> {
    const result = await _runGoogleUrl(baseUrl, pages, requireDate, retryCount)
    // If we got 0 jobs and haven't retried yet, try again with a different user agent
    if (result.jobs.length === 0 && retryCount < 2) {
        console.log(`⚠️ Google returned 0 jobs. Retrying with different user agent (attempt ${retryCount + 2}/3)...`)
        await sleep(randomDelay(3000, 6000))
        return runGoogleUrl(baseUrl, pages, requireDate, retryCount + 1)
    }
    return result
}

async function _runGoogleUrl(baseUrl: string, pages: number, requireDate: boolean, retryCount = 0) {
    const ua = USER_AGENTS[retryCount % USER_AGENTS.length]
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: ua,
        viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()

    try {
        const collected: ExtractedJob[] = []
        const seenIds = new Set<string>()
        let hasAnyPostedDate = false
        let emptyPages = 0
        let zeroNewUniquePages = 0

        for (let pageNum = 1; pageNum <= pages; pageNum++) {
            const pageUrl = buildGooglePageUrl(baseUrl, pageNum)
            console.log(`📄 Google page ${pageNum}: ${pageUrl}`)

            await navigateSource(page, pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await sleep(randomDelay(1400, 2600))

            // Extract jobs using primary selectors, with fallback to structural patterns
            let jobs = await page.evaluate(() => {
                // Primary selectors (Google's current class names — may change)
                let cards = Array.from(document.querySelectorAll('li.lLd3Je'))
                // Fallback: find job list items by structure (li with h3 + link containing /results/)
                if (cards.length === 0) {
                    cards = Array.from(document.querySelectorAll('li'))
                        .filter(li => li.querySelector('h3') && li.querySelector('a[href*="/results/"]'))
                }
                return cards.map(card => {
                    const titleEl = card.querySelector('h3.QJPWVe') || card.querySelector('h3')
                    const title = titleEl?.textContent?.trim() || ''
                    const locEl = card.querySelector('span.r0wTof') || card.querySelector('span[class*="loc"], span[class*="Loc"]')
                    const location = locEl?.textContent?.trim() || ''
                    const linkEl = (card.querySelector('a.WpHeLc') || card.querySelector('a[href*="/results/"]')) as HTMLAnchorElement | null
                    const href = linkEl?.href || ''
                    const idMatch = href.match(/results\/(\d+)/)
                    const id = idMatch ? idMatch[1] : `${title}_${location}`.replace(/\s+/g, '_').slice(0, 40)

                    const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [aria-label*="Posted"], [aria-label*="posted"]')
                    const dateText = dateEl?.textContent?.trim() || ''
                    return { id, title, location, url: href, text: card.textContent || '', dateText }
                }).filter(j => j.title)
            }) as ExtractedJob[]

            if (jobs.length === 0 && pageNum === 1) {
                console.log('   ⚠️ No jobs found with selectors. Retrying with networkidle...')
                await navigateSource(page, baseUrl, { waitUntil: 'networkidle', timeout: 60000 })
                await sleep(3000)
                jobs = await page.evaluate(() => {
                    let cards = Array.from(document.querySelectorAll('li.lLd3Je'))
                    if (cards.length === 0) {
                        cards = Array.from(document.querySelectorAll('li'))
                            .filter(li => li.querySelector('h3') && li.querySelector('a[href*="/results/"]'))
                    }
                    return cards.map(card => {
                        const title = (card.querySelector('h3.QJPWVe') || card.querySelector('h3'))?.textContent?.trim() || ''
                        const location = (card.querySelector('span.r0wTof') || card.querySelector('span[class*="loc"]'))?.textContent?.trim() || ''
                        const linkEl = (card.querySelector('a.WpHeLc') || card.querySelector('a[href*="/results/"]')) as HTMLAnchorElement | null
                        const href = linkEl?.href || ''
                        const idMatch = href.match(/results\/(\d+)/)
                        const id = idMatch ? idMatch[1] : `${title}_${location}`.replace(/\s+/g, '_').slice(0, 40)
                        const dateEl = card.querySelector('[class*="date"], [class*="Date"], time, [aria-label*="Posted"]')
                        const dateText = dateEl?.textContent?.trim() || ''
                        return { id, title, location, url: href, text: card.textContent || '', dateText }
                    }).filter(j => j.title)
                }) as ExtractedJob[]
            }

            if (jobs.length === 0) {
                emptyPages++
                if (emptyPages >= 2) break
                continue
            }
            emptyPages = 0
            console.log(`   ✅ ${jobs.length} jobs on page ${pageNum}`)
            let newUniqueThisPage = 0

            for (const j of jobs) {
                if (seenIds.has(j.id)) continue
                seenIds.add(j.id)
                newUniqueThisPage++
                const parsed = parsePostedDate(j.dateText || looksLikeDate(j.text))
                if (parsed) hasAnyPostedDate = true
                collected.push(j)
            }

            if (requireDate && !hasAnyPostedDate && pageNum >= 3) {
                return { hasDate: false, jobs: [] as ExtractedJob[] }
            }

            if (newUniqueThisPage === 0) {
                zeroNewUniquePages++
                if (zeroNewUniquePages >= 2) break
            } else {
                zeroNewUniquePages = 0
            }
        }

        if (requireDate && !hasAnyPostedDate) {
            return { hasDate: false, jobs: [] as ExtractedJob[] }
        }

        return { hasDate: hasAnyPostedDate, jobs: collected }
    } finally {
        await browser.close()
    }
}

/**
 * Fetch datePosted from a Google job detail page via JSON-LD structured data.
 */
async function fetchGoogleDetailDate(jobUrl: string): Promise<string | null> {
    try {
        const resp = await fetch(jobUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html',
            },
        })
        if (!resp.ok) return null
        const html = await resp.text()
        const regex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi
        let match: RegExpExecArray | null
        while ((match = regex.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(match[1].trim())
                const entries = Array.isArray(parsed) ? parsed : [parsed]
                for (const e of entries) {
                    if (e?.['@type'] === 'JobPosting' && e?.datePosted) {
                        return parsePostedDate(String(e.datePosted))
                    }
                }
            } catch { /* ignore malformed JSON-LD */ }
        }
    } catch { /* ignore fetch errors */ }
    return null
}

async function scrapeGoogleJobs() {
    console.log(`🚀 Google Jobs Scraper`)
    const company = await getCompany(CONFIG.companyName)
    console.log(`✅ Company: ${company.name} (id: ${company.id})`)

    const primaryUrl = company.careers_url || 'https://www.google.com/about/careers/applications/jobs/results?location=United%20States&sort_by=date&employment_type=INTERN&employment_type=TEMPORARY&employment_type=FULL_TIME'
    const fallbackUrl = company.careers_url_1

    console.log(`🔗 Primary URL: ${primaryUrl}`)
    if (fallbackUrl) console.log(`🔁 Secondary URL: ${fallbackUrl}`)

    let sourceUrl = primaryUrl
    let result = await runGoogleUrl(primaryUrl, CONFIG.maxPages, true)

    if (!result.hasDate) {
        console.log('⚠️ No posting date in primary jobs.')
        if (fallbackUrl) {
            sourceUrl = fallbackUrl
            const second = await runGoogleUrl(fallbackUrl, CONFIG.maxPages, true)
            if (second.hasDate) {
                console.log('✅ Using secondary URL with posting dates.')
                result = second
            } else {
                console.log('⚠️ Secondary URL also has no posting dates. Skipping Google jobs.')
            }
        } else {
            console.log('⚠️ No secondary URL and no posting dates found. Skipping Google jobs.')
        }
    }

    const collectedJobs: DbJob[] = []
    let detailFetched = 0
    for (const j of result.jobs) {
        let postedDate = parsePostedDate(j.dateText || looksLikeDate(j.text))

        // If no date from list page, try fetching the detail page JSON-LD
        if (!postedDate && j.url) {
            postedDate = await fetchGoogleDetailDate(j.url)
            if (postedDate) detailFetched++
            await sleep(randomDelay(300, 700))
        }

        if (!postedDate || !isWithinDaysOrFuture(postedDate, CONFIG.dateWindowDays)) {
            continue
        }

        const finalPostedDate = postedDate
        const job: DbJob = {
            company_id: company.id,
            external_job_id: `google_${j.id}`,
            title: j.title,
            location: j.location || 'United States',
            location_type: determineLocationType(j.location),
            department: normalizeDepartment('General', j.title),
            employment_type: determineEmploymentType(j.title),
            posted_date: finalPostedDate,
            description: cleanHtml(j.text),
            summary: `${j.title} at Google - ${j.location}`,
            required_qualifications: [],
            preferred_qualifications: [],
            pay_range: extractPayRange(j.text),
            security_clearance: detectSecurityClearance(j.text),
            h1b_sponsorship: detectH1BSponsorship(j.text),
            job_url: j.url,
            is_active: true,
        }
        collectedJobs.push(job)
    }

    console.log(`📊 Total jobs collected (Phase 1): ${collectedJobs.length}`)
    if (collectedJobs.length === 0) {
        console.log('⚠️  No jobs found.')
        return
    }

    // Phase 2: Enrich each job by visiting its detail page
    console.log(`\n📝 Phase 2: Enriching ${collectedJobs.length} jobs with detail content...`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    })
    const detailPage = await context.newPage()
    let enriched = 0
    let failed = 0

    for (let i = 0; i < collectedJobs.length; i++) {
        const job = collectedJobs[i]
        if (!job.job_url) { failed++; continue }

        try {
            await navigateSource(detailPage, job.job_url, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await sleep(randomDelay(1500, 2500))

            // Extract all text content from the main content area
            const pageText = await detailPage.evaluate(() => {
                // Try to get the main content container
                const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body
                return main?.innerText || ''
            })

            if (pageText.length > 100) {
                const detail = parseGoogleDetailText(pageText)

                // About the Job → summary
                if (detail.aboutTheJob) {
                    job.summary = detail.aboutTheJob
                }

                // Responsibilities → description (bullet points)
                if (detail.responsibilities.length > 0) {
                    const respText = detail.responsibilities.map(r => `• ${r}`).join('\n')
                    if (detail.payRange) {
                        job.description = respText + '\n\n---OTHER_INFO---\n' + detail.payRange
                    } else {
                        job.description = respText
                    }
                }

                // Qualifications
                if (detail.minQualifications.length > 0) {
                    job.required_qualifications = detail.minQualifications
                }
                if (detail.prefQualifications.length > 0) {
                    job.preferred_qualifications = detail.prefQualifications
                }

                // Pay range
                if (detail.payRange) {
                    job.pay_range = extractPayRange(detail.payRange) || job.pay_range
                }

                // Re-detect signals from full text
                const fullText = `${detail.aboutTheJob}\n${detail.responsibilities.join('\n')}\n${detail.minQualifications.join('\n')}\n${detail.prefQualifications.join('\n')}\n${detail.payRange}`
                job.security_clearance = detectSecurityClearance(fullText)
                job.h1b_sponsorship = detectH1BSponsorship(fullText)
                job.location_type = determineLocationType(job.location, fullText)

                enriched++
            } else {
                failed++
            }
        } catch {
            failed++
        }

        if ((i + 1) % 25 === 0 || i === collectedJobs.length - 1) {
            console.log(`   📝 Progress: ${i + 1}/${collectedJobs.length} (${enriched} enriched, ${failed} failed)`)
        }
    }

    await browser.close()
    console.log(`   ✅ Enrichment complete: ${enriched} enriched, ${failed} failed out of ${collectedJobs.length}`)

    console.log(`   📅 ${detailFetched} jobs got date from detail page fetch`)
    console.log(`\n🗄️  Upserting ${collectedJobs.length} jobs...`)
    const upsertedCount = await upsertJobsBatch(collectedJobs)
    const dbCount = await getCompanyJobCount(company.id)
    logSummary(CONFIG.companyName, collectedJobs.length, upsertedCount, dbCount, sourceUrl)
}

withScraperRun(CONFIG.companyName, scrapeGoogleJobs).catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
})
