# Project Change Logs

## 2026-02-16

### 1. Initial Project Setup
- Analyzed project structure and dependencies.
- Installed project dependencies.
- Started dev server with Next.js Turbopack.
- Added baseline project documentation.

### 2. Test Framework Setup
- Installed and configured Jest + Testing Library.
- Added `jest.config.js` multi-project setup (frontend/backend/lib).
- Added `jest.setup.js` for `@testing-library/jest-dom` and `matchMedia` mocks.
- Added test scripts in `package.json`:
  - `test`
  - `test:watch`
  - `test:coverage`
- Added initial frontend/lib/integration/backend test suites.

### 3. Repository Hygiene
- Added/updated `.gitignore` entries for Node/Next/test artifacts and env files.

---

## 2026-03-02

### 1. Scraper Program Goals (Execution Plan)
- Shifted from “basic scraping” to production scraper reliability.
- Applied consistent policy across companies:
  - Prefer real posting date when available.
  - Use company secondary URL (`careers_url_1`) if primary does not expose date.
  - If no date and no secondary source, scrape fallback window (first 20 pages) and persist.
  - Upsert jobs by stable external IDs to avoid duplicates.

### 2. Company-by-Company Scraper Work

#### Phase A: Microsoft + Google
- Validated scraper behavior against user-provided sample jobs.
- Ensured data extraction includes key metadata and detailed content.
- Confirmed rerun-readiness (no manual intervention needed).

#### Phase B: Meta + Nvidia
- Validated list-page + detail-page extraction paths.
- Confirmed both scrapers return expected sample jobs and details.

#### Phase C: Apple + IBM
- Verified Apple list/detail parsing including posted date and role number.
- Verified IBM API/detail fields including posted date and metadata extraction.

#### Phase D: Salesforce + Accenture
- Salesforce:
  - Investigated missing and stale postings.
  - Enforced date-window behavior and future-date compatibility logic.
- Accenture:
  - Updated date strategy to use list-card posting signal (`Posted X days ago`) as requested.
  - Avoided relying on “Qualification: We anticipate this job posting...” text.

#### Phase E: Deloitte + JPMorgan Chase
- Confirmed both expose usable posting dates.
- Deloitte:
  - Date extraction from detail page JSON-LD (`JobPosting.datePosted`).
  - Retained fallback flow when posting dates are unavailable.
- JPMorgan:
  - Kept Oracle HCM API date-driven filtering flow.

#### Phase F: Visa + Amazon
- Visa:
  - Validated sample jobs and date extraction (`createdOn`).
  - Updated city filtering to parse `cities` dynamically from `careers_url` instead of hardcoded list.
- Amazon:
  - Validated sample jobs and insertion behavior.
  - Confirmed large pagination run and DB upsert behavior.

### 3. Master Rerun + DB Behavior
- Re-ran full scraper set multiple times to verify stability.
- Confirmed jobs are stored via upsert semantics and do not duplicate by `external_job_id`.

### 4. Scraper Status Tracking Feature (UI + Backend)
- Added new status tracking table SQL:
  - `scripts/sql/create-scraper-runs.sql`
- Added UI `Jobs | Status` toggle in top bar:
  - `components/job-dashboard.tsx`
- Added scraper status table component:
  - `components/scraper-status-table.tsx`
- Added status query function:
  - `lib/job-data.ts` (`getScraperStatuses`)
- Updated DB types:
  - `lib/supabase.ts` (`scraper_runs` types)
- Updated master runner to persist run status:
  - `scripts/scrape-all-jobs.ts`
  - status values: `Successful`, `Error`, `Partial`
  - stores timestamps, duration, error message

### 5. Status Upsert Correction
- Changed `scraper_runs` persistence from insert to upsert by company:
  - `upsert(..., { onConflict: 'company_name' })`
- Added unique index requirement:
  - `uq_scraper_runs_company_name` on `scraper_runs(company_name)`
- Result:
  - one row per company in `scraper_runs`
  - reruns update existing row fields (`completed_at`, `status`, `duration_seconds`, etc.)

### 6. Documentation Rewrite
- Replaced `README.md` with full runbook documentation:
  - architecture diagram
  - sequence/data flow diagram
  - setup and env requirements
  - app run commands
  - scraper run commands (all/single/individual)
  - DB model and `scraper_runs` behavior
  - troubleshooting and contributor notes

### 7. Backend Test Expansion for Scraper Logic
- Added backend scraper utility tests:
  - `__tests__/backend/scraper-utils.test.ts`
  - covers date parsing/filtering, location detection, text cleanup, pay range extraction, classification helpers, employment/location type inference, random delay bounds
- Added backend scraper status tests:
  - `__tests__/backend/scraper-status.test.ts`
  - verifies latest status selection and `Not Run` fallback behavior
- Executed targeted tests:
  - `npx jest --runTestsByPath __tests__/backend/scraper-utils.test.ts __tests__/backend/scraper-status.test.ts --runInBand`
  - Result: 18 passing, 0 failing

### 8. Existing Test Suite Constraint (Known)
- Older backend tests (`job-queries`, `company-queries`, `supabase-connection`) are integration-style and require reachable live Supabase/network.
- In restricted/offline environments they fail with DNS/network fetch errors.

---

## Current State Summary
- Scrapers are operational across targeted companies with date/fallback policy implemented.
- Status tracking is implemented end-to-end (DB + runner + UI).
- README is production-style and aligned with actual commands/architecture.
- Logs now include full timeline from initial setup through latest testing/documentation updates.

---

## 2026-03-02 (Performance + Apply Button Fix)

### 1. Job Detail Performance Improvements
- Added caching at the route level in `app/jobs/[id]/page.tsx`:
  - `cache(getJobById)` and `cache(getJobs)` to dedupe server fetches.
  - Reused cached job lookup across both `generateMetadata` and page render.
- Added route revalidation window:
  - `export const revalidate = 300`
- Added loading UI for job details route:
  - `app/jobs/[id]/loading.tsx`
  - improves perceived performance while data loads.

### 2. Apply Button Fix
- Updated `components/job-detail-content.tsx`:
  - top CTA and bottom CTA now open the external job application URL (`job_url`) in a new tab.
  - both buttons now use real anchors with `target=\"_blank\"` and `rel=\"noopener noreferrer\"`.

### 3. Data Model Mapping Update
- Extended frontend `Job` type in `lib/job-data.ts` with:
  - `jobUrl`
- Mapped `job_url` from DB into `jobUrl` in:
  - `getJobs()`
  - `getJobById()`

### 4. Dashboard Back-Navigation Speedup
- Updated `components/job-detail-content.tsx` back action:
  - uses `router.back()` when browser history is available,
  - falls back to `router.push('/')` otherwise.
- Added client-side dashboard cache in `components/job-dashboard.tsx`:
  - `sessionStorage` key: `job_dashboard_cache_v1`
  - TTL: 5 minutes
  - restores jobs/company/status immediately on return to dashboard,
  - then refreshes from DB in background and rewrites cache.

### 5. Dashboard Load Optimization (Follow-up)
- Optimized `getJobs()` in `lib/job-data.ts`:
  - added in-memory cache + in-flight request deduplication (5 min TTL),
  - reduced list payload by selecting only dashboard-required columns,
  - keeps full detail payload retrieval in `getJobById()` for job detail pages.
- Hardened dashboard session cache hydration in `components/job-dashboard.tsx`:
  - converts cached `postedDate` back into `Date`,
  - guards `sessionStorage` writes with try/catch.

### 6. Dashboard Card CTA Update
- Updated `components/job-card.tsx`:
  - removed inline `Clearance` and `H1B` badges from job cards,
  - added `Apply` button on both desktop and mobile card layouts,
  - button opens `job.jobUrl` (company job page) in a new tab,
  - disabled `Apply` button shown when URL is unavailable.
- Updated `__tests__/frontend/job-card.test.tsx` mock job object to include `jobUrl`.
