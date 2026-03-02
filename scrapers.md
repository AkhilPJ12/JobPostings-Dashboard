# Scrapers Technical Guide

This document explains every scraper in this project one-by-one:
- where it fetches jobs from,
- filters applied,
- date window logic,
- fallback behavior,
- pagination/stop conditions,
- fields written to DB.

## 1. Common Scraper Architecture

### 1.1 Shared helpers
Most scrapers use `scripts/scraper-utils.ts` for:
- `parsePostedDate(...)`
- `isWithinDaysOrFuture(...)` (allows future posting dates)
- `isUSLocation(...)`
- `detectSecurityClearance(...)`
- `detectH1BSponsorship(...)`
- `determineLocationType(...)`
- `determineEmploymentType(...)`
- `upsertJobsBatch(...)`

### 1.2 DB write behavior
All scrapers write to `jobs` with upsert conflict key:
- `external_job_id`

So re-runs update existing jobs instead of creating duplicates.

### 1.3 Standard DB payload fields
Most scrapers write these fields:
- `company_id`
- `external_job_id`
- `title`
- `location`
- `location_type`
- `department`
- `employment_type`
- `posted_date`
- `description`
- `summary`
- `required_qualifications`
- `preferred_qualifications`
- `pay_range`
- `security_clearance`
- `h1b_sponsorship`
- `job_url`
- `is_active`

### 1.4 Status tracking
`scripts/scrape-all-jobs.ts` runs all scrapers and upserts one status row per company into `scraper_runs`:
- `status`: `Successful` | `Error` | `Partial`
- `started_at`, `completed_at`, `duration_seconds`
- `error_message`

`onConflict: company_name` means company status row is updated on rerun.

---

## 2. Master Runner

File: `scripts/scrape-all-jobs.ts`

Runs these scrapers in sequence:
- Amazon
- Microsoft (`scrape-pcsx-jobs.ts microsoft`)
- Nvidia (`scrape-pcsx-jobs.ts nvidia`)
- Google
- Meta
- Apple
- IBM
- Salesforce
- Accenture
- Visa
- JPMorgan Chase
- Deloitte

Timeout per scraper: 10 minutes.

---

## 3. Company Scrapers

## 3.1 Amazon

File: `scripts/scrape-amazon-jobs.ts`

### Source
- Amazon JSON API derived from careers URL:
  - list page URL transformed to `.../search.json?...`

### Filters
- Country must be US (`country_code` in USA aliases).
- Date filter: last 14 days (`isWithinDays`, strict recent window).

### Date window
- `CONFIG.dateWindowDays = 14`
- Jobs without valid date are skipped.

### Pagination
- `result_limit = 100`
- `maxPages = 300`
- Moves by `offset += 100`
- Stops when API results exhausted / short page / API error.

### External ID pattern
- `external_job_id = id_icims`

### Notes
- Reads multiple Amazon career URLs from company record (comment indicates `careers_url_1..4` support).
- Employment type is currently fixed to `Full-time`.

---

## 3.2 Microsoft (PCSX)

File: `scripts/scrape-pcsx-jobs.ts` (`microsoft` mode)

### Source
- Microsoft PCSX API endpoint:
  - `/api/pcsx/search?domain=microsoft.com...`
- Built from company `careers_url` query params.

### Filters
- Location via URL params (default: US multiple locations).
- US/remote/multiple-locations accepted.

### Date window
- `dateWindowDays = 14`
- Requires posted date in normal mode.
- Uses `isWithinDaysOrFuture`.

### Fallback behavior
1. Run primary URL requiring date.
2. If no posting dates found, try `careers_url_1`.
3. If still no date, scrape first 20 pages with `requireDate=false`.

When no date in fallback mode, `posted_date` is set to today.

### Pagination
- `pageSize = 10`
- `maxPages = 100`
- Uses `start=(page-1)*10`
- Early stop after 3 consecutive stale/out-of-range pages.

### External ID pattern
- `external_job_id = microsoft_<displayJobId|atsJobId|id>`

---

## 3.3 Nvidia (PCSX + Workday)

File: `scripts/scrape-pcsx-jobs.ts` (`nvidia` mode)

### Source
Two modes:
1. Workday CXS (preferred when URL contains `myworkdayjobs.com`)
2. Nvidia Eightfold PCSX API fallback (`nvidia.eightfold.ai/api/pcsx/search`)

### Filters
- US location / remote filter.
- Workday mode can apply `locationHierarchy1` facet from URL.

### Date window
- `dateWindowDays = 14`
- Requires posted date in normal mode.
- Uses `isWithinDaysOrFuture`.

### Fallback behavior
1. Primary URL with required dates.
2. `careers_url_1` if available.
3. If still no dates, first 20 pages with `requireDate=false`.

When no date in fallback mode, `posted_date` can default to today for saved records.

### Pagination
- `pageSize = 20`
- `maxPages = 120`
- Stops on empty/short pages.

### External ID pattern
- `external_job_id = nvidia_<jobId>`

---

## 3.4 Google

File: `scripts/scrape-google-jobs.ts`

### Source
- Google Careers web pages (Playwright DOM scraping).

### Filters
- List URL is configured for US and sorted by date in company `careers_url`.
- Date extraction from card text/date text.

### Date window
- `dateWindowDays = 14`
- Uses `isWithinDaysOrFuture` when dates exist.

### Fallback behavior
1. Primary URL with date-required mode.
2. Secondary `careers_url_1` if no dates found.
3. If no date source, scrape first 20 pages and store with fallback date (today).

### Pagination
- `maxPages = 150`
- Page URL sets `page` and `start=pageIndex*20`.

### External ID pattern
- `external_job_id = google_<parsed-id>`

---

## 3.5 Meta

File: `scripts/scrape-meta-jobs.ts`

### Source
- Meta GraphQL jobs endpoint discovered via browser context.
- Detail URL format: `metacareers.com/profile/job_details/<id>`

### Filters
- US location or remote only.

### Date window
- `dateWindowDays = 14`
- Uses `isWithinDaysOrFuture` when posted date exists.

### Fallback behavior
1. Primary URL require-date mode.
2. `careers_url_1` if configured and needed.
3. Otherwise first 20 pages without date requirement.

Missing dates in no-date mode use today as `posted_date`.

### Pagination
- `maxPages = 100`
- `maxPagesNoDate = 20`
- assumed page size: 20.

### External ID pattern
- `external_job_id = meta_<id>`

---

## 3.6 Apple

File: `scripts/scrape-apple-jobs.ts`

### Source
- Apple Jobs web UI via Playwright.
- Uses selectors like:
  - `li.rc-accordion-item` cards
  - title/link: `a.link-inline.t-intro`
  - location: `span.table--advanced-search__location-sub`
  - posted date: `span.job-posted-date`

### Filters
- Uses company URL configured for US jobs.

### Date window
- `dateWindowDays = 14`
- Uses `isWithinDaysOrFuture`.
- Jobs outside window are skipped.

### Pagination
- `maxPages = 100`
- Uses next button `button[aria-label="Next Page"]`.
- Early-stop if most jobs on page are older than date window.

### External ID pattern
- `external_job_id = apple_<id>`

---

## 3.7 IBM

File: `scripts/scrape-ibm-jobs.ts`

### Source
- IBM search API: `https://www-api.ibm.com/search/api/v2`

### Filters
- Payload post-filter includes `field_keyword_05 = "United States"`.

### Date window
- `dateWindowDays = 14`
- Date taken from `hit.sort[0]` (timestamp).
- Uses `isWithinDaysOrFuture`.

### Pagination
- `pageSize = 30`
- `maxPages = 40`
- Uses `from = page * pageSize`.

### External ID pattern
- `external_job_id = ibm_<jobId-or-url-derived-id>`

---

## 3.8 Salesforce

File: `scripts/scrape-salesforce-jobs.ts`

### Source
- Salesforce careers list pages via Playwright.
- For jobs missing list-card posted date, detail page is fetched (`context.request.get`) and parsed.

### Filters
- Base URL includes `country=United States of America`.

### Date window
- `dateWindowDays = 14`
- Date is required in current behavior:
  - jobs without resolvable date are skipped.
- Uses `isWithinDaysOrFuture`.

### Fallback behavior
- Script has `careers_url_1` awareness; if no dates found, it logs and can switch source URL context.

### Pagination
- `maxPages = 30`
- No-date fallback cap exists in config (`maxPagesNoDate=20`) but primary behavior enforces date through detail recovery.

### External ID pattern
- `external_job_id = salesforce_<job-id-lowercase>`

### Special behavior
- Deactivates old Salesforce jobs in DB:
  - sets `is_active=false` where `posted_date` older than cutoff (`today - 14 days`).

---

## 3.9 Accenture

File: `scripts/scrape-accenture-jobs.ts`

### Source
- Accenture internal endpoint via browser context:
  - `/api/accenture/elastic/findjobs`

### Filters
- `jobCountry=USA`
- `countrySite=us-en`
- sorted by newest (`sortBy=2`)

### Date window
- `dateWindowDays = 14`
- Posting date resolved from list-card text (e.g., `Posted 10 days ago`), then fallback to `updateDate`.
- Uses `isWithinDaysOrFuture`.

### Pagination
- `pageSize = 20`
- `maxPages = 80`
- Uses `startIndex = page * pageSize`.
- Early stop on consecutive out-of-range pages.

### External ID pattern
- `external_job_id = accenture_<requisitionId|guid>`

---

## 3.10 Visa

File: `scripts/scrape-visa-jobs.ts`

### Source
- Visa search API:
  - `https://search.visa.com/CAREERS/careers/jobs?q=` (POST)

### Filters
- City filters loaded dynamically from company `careers_url` query (`cities=` params).
- If not present, uses default US city list.
- Country check ensures US only.

### Date window
- `dateWindowDays = 14`
- Uses real `createdOn` from API.
- Uses `isWithinDaysOrFuture`.

### Pagination
- `pageSize = 100`
- `maxPages = 30`
- `from = page * 100`
- stops on no-new pages / short pages / API end.

### External ID pattern
- `external_job_id = visa_<refNumber|postingId>`

---

## 3.11 JPMorgan Chase

File: `scripts/scrape-jpmorgan-jobs.ts`

### Source
- Oracle HCM Candidate Experience API:
  - `recruitingCEJobRequisitions` finder query

### Filters
- `selectedPostingDatesFacet=14`
- `locationId=300000000289738` (United States)
- sort by posting date desc.

### Date window
- `dateWindowDays = 14`
- Requires `PostedDate`.
- Uses `isWithinDaysOrFuture`.

### Pagination
- `pageSize = 25`
- `maxPages = 120`
- `offset = page * 25`

### External ID pattern
- `external_job_id = jpmorgan_<Id>`

### Write pattern
- Upserts page-by-page (not only at end), so partial progress is persisted.

---

## 3.12 Deloitte

File: `scripts/scrape-deloitte-jobs.ts`

### Source
- Deloitte search/list pages via Playwright.
- Job detail page fetched and parsed for JSON-LD `JobPosting.datePosted`.

### Filters
- List URLs built with `jobOffset` pagination.

### Date window
- `dateWindowDays = 14`
- Uses detail `datePosted` + `isWithinDaysOrFuture`.

### Fallback behavior
1. Primary `careers_url` in require-date mode.
2. If no dates, try `careers_url_1`.
3. If still no dates, scrape first 20 pages and store.

In no-date fallback mode, `posted_date` defaults to today.

### Pagination
- `pageSize = 10`
- `maxPages = 80`
- fallback no-date mode: `maxPagesNoDate = 20`
- early stop after 3 stale pages.

### External ID pattern
- `external_job_id = deloitte_<job-id>`

---

## 4. Date Rules Summary (Quick View)

- Strict recent window (14 days): all scrapers.
- Function used in most scripts: `isWithinDaysOrFuture` (future-dated postings are allowed).
- Amazon uses strict `isWithinDays` in current script.
- For “no-date available” fallback mode (Google/Meta/Microsoft/Nvidia/Deloitte):
  - scrape limited first 20 pages,
  - if needed, save with `posted_date = today`.
- Salesforce currently skips jobs with unresolved dates after list+detail attempts.

---

## 5. Commands

Run all:

```bash
npx tsx scripts/scrape-all-jobs.ts
```

Run one via master runner:

```bash
npx tsx scripts/scrape-all-jobs.ts microsoft
```

Run individual scraper:

```bash
npx tsx scripts/scrape-visa-jobs.ts
npx tsx scripts/scrape-amazon-jobs.ts
```

---

## 6. Source Field Mapping (What Each Scraper Reads)

This section lists the main upstream fields each scraper reads before mapping to DB.

### Amazon
- ID: `id_icims`
- Title: `title`
- Date: `posted_date`
- Location: `normalized_location` / `location` / `city` / `country_code`
- Department: `job_category`
- Description/quals: `description`, `basic_qualifications`, `preferred_qualifications`
- URL path: `job_path`

### Microsoft (PCSX)
- ID: `displayJobId` / `atsJobId` / `id`
- Title: `name`
- Date: `postedTs` / `creationTs`
- Location: `locations[]`
- Department: `department`
- URL: `positionUrl`

### Nvidia (Workday / PCSX)
- Workday list: `title`, `postedOn`, `locationsText`, `externalPath`, `bulletFields`
- Workday detail: `jobPostingInfo.title`, `jobDescription`, `location`, `postedOn`, `startDate`, `timeType`
- PCSX fallback: `name`, `postedTs`, `creationTs`, `locations[]`, `department`, `positionUrl`

### Google
- Card extraction from DOM:
  - title text
  - location text
  - date text (if present)
  - job URL / parsed ID
  - full card text (description summary source)

### Meta
- GraphQL job list:
  - `id`, `title`, `locations[]`, `teams[]`, `sub_teams[]`
- Card/detail text used for date and description extraction where available.

### Apple
- DOM card fields:
  - title/link (`a.link-inline.t-intro`)
  - location (`span.table--advanced-search__location-sub`)
  - date (`span.job-posted-date`)
  - job URL and extracted ID

### IBM
- `_source.title`
- `_source.url`
- `_source.description`
- `_source.field_keyword_19` (location)
- `_source.field_keyword_08` (department)
- `sort[0]` timestamp (posting date)

### Salesforce
- List card:
  - title
  - job URL
  - location
  - department
  - visible date text if present
- Detail page fallback:
  - `Posted <date>` text
  - full page cleaned description text

### Accenture
- API result fields:
  - `requisitionId` / `guid`
  - `title`
  - `postedDateText` (e.g., Posted X days ago)
  - `updateDate`
  - `location[]` / `feedCity`
  - `businessArea`, `function[]`
  - `jobDescriptionClean`, `qualificationClean`, `additionalInformation`
  - `jobDetailUrl`

### Visa
- API fields:
  - `refNumber` / `postingId`
  - `jobTitle`
  - `createdOn`
  - `city`, `region`, `countryCode`, `country`
  - `department`, `function`, `superDepartment`
  - `jobDescription`, `qualifications`, `additionalInformation`
  - `typeOfEmployment`
  - `applyUrl`

### JPMorgan Chase
- `Id`
- `Title`
- `PostedDate`
- `PrimaryLocation`, `PrimaryLocationCountry`, `workLocation[]`
- `Department`, `JobFamily`
- `WorkerType`, `JobType`, `ContractType`
- `ShortDescriptionStr`, `ExternalResponsibilitiesStr`, `ExternalQualificationsStr`

### Deloitte
- List card:
  - job ID from detail URL
  - title
  - location line text
  - detail URL
- Detail page JSON-LD:
  - `JobPosting.datePosted`
  - `JobPosting.description`
