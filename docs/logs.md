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
  - `pnpm exec jest --runTestsByPath __tests__/backend/scraper-utils.test.ts __tests__/backend/scraper-status.test.ts --runInBand`
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

---

## 2026-03-15

### 1. Deployment to Vercel
- Removed `generateStaticParams()` from `app/jobs/[id]/page.tsx` to avoid pre-building 7000+ static pages (exceeded Vercel Hobby plan size limits).
- Added `dynamicParams = true` + `revalidate = 300` for on-demand ISR.
- Fixed `pnpm-lock.yaml` — was in `.gitignore`, causing `ERR_PNPM_OUTDATED_LOCKFILE` on Vercel.
- Fixed git author email for Vercel deployment verification.

### 2. Posted Date Strictness
- Made all scrapers (except Meta/Google) strict — skip jobs without posted dates.
- Removed `new Date()` fallback from Apple, Microsoft, Nvidia, Deloitte scrapers.
- Added `preservePostedDate` pattern for Meta/Google — first-seen date preserved on re-scrapes.

### 3. GitHub Actions CI
- Added `.github/workflows/scrape-jobs.yml` — cron every 6 hours (`0 */6 * * *`).
- Installs Playwright Chromium, runs `scrape-all-jobs.ts` with Supabase secrets.

---

## 2026-03-16

### 1. Apple Scraper — Full Detail Page Scraping
- Updated `scrape-apple-jobs.ts` to fetch full detail pages (summary, description, responsibilities, qualifications).
- Phase 1 collects job links from list pages, Phase 2 fetches details in parallel batches of 4.
- Selectors: `h2.t-label` sidebar labels + adjacent `div.column.large-9` content blocks.

### 2. UI Fixes
- Fixed double X in search bar — changed `type="search"` to `type="text"` to remove browser's native clear button.
- Fixed "Today" date filter — uses local date string instead of UTC to avoid evening-timezone mismatch.
- Replaced "Last 30 days" filter with "Last 14 days" to match actual DB retention window.

---

## 2026-03-30

### 1. New Company Scrapers (12 companies added)
- **Generic Workday scraper** (`scrape-workday-jobs.ts`): Reusable for any `*.myworkdayjobs.com` site. Uses CXS API. Handles CVS, AT&T, Walmart, CarMax.
- **Texas Instruments** (`scrape-ti-jobs.ts`): Oracle HCM career site, MM/DD/YYYY dates on detail pages.
- **Staples** (`scrape-staples-jobs.ts`): Paginated list → detail page scraping. Dates on detail page (MM/DD/YYYY).
- **Intuit** (`scrape-intuit-jobs.ts`): Client-side pagination with "Date Posted" sort. No dates — uses first-seen pattern.
- **Datavant** (`scrape-datavant-jobs.ts`): Pure Greenhouse API (no browser needed, 1-second runs). Real dates via `first_published`.
- **Wells Fargo** (`scrape-wellsfargo-jobs.ts`): 1300+ US jobs, paginated list → detail pages. Dates in "DD Mon YYYY" format.
- **Infosys** (`scrape-infosys-jobs.ts`): Multi-URL support (careers_url + careers_url_1). No dates — uses first-seen pattern.
- **Goldman Sachs** (`scrape-goldmansachs-jobs.ts`): GraphQL API via browser context. No dates — uses first-seen pattern.
- **Wipro** (`scrape-wipro-jobs.ts`): Paginated list → detail pages. Real dates via "Posting Start Date" field.
- Updated `scrape-all-jobs.ts` with all 24 companies.

### 2. Data Quality Fixes
- Fixed Salesforce — all 319 descriptions contained JavaScript cookie consent code (`OptanonWrapper`). Root cause: `fetchSalesforceDetail` was capturing full 404 page HTML. Fix: added 404 detection + `cleanHtml` now strips `<script>` and `<style>` tags.
- Cleaned 171 dirty Salesforce descriptions directly in DB.
- Fixed trailing spaces in company names ("Texas Instruments ", "Goldman Sachs ").

### 3. Code Refactoring
- Added shared utilities to `scraper-utils.ts`:
  - `truncateField(value, maxLen=250)` — protects against varchar(255) DB overflows.
  - `parseSlashDate(str)` — MM/DD/YYYY parser (replaces 3 local duplicates).
  - `parseDayMonthYear(str)` — "DD Mon YYYY" parser (replaces 1 local duplicate).
  - `parseRelativePostedDate(str)` — "Posted X days ago" parser (replaces 1 local duplicate).
  - `launchBrowser(options)` — standard browser context factory (dynamic import).
- Fixed critical truncation bugs in `scrape-workday-jobs.ts` and `scrape-ti-jobs.ts` (had NO field truncation).
- Removed duplicate `isUSLocation()` from `scrape-datavant-jobs.ts`.
- Updated `cleanHtml()` to strip `<script>`, `<style>` tags and leaked JS patterns.

### 4. Test Expansion
- Added 17 new tests to `__tests__/backend/scraper-utils.test.ts` (16 → 33 total):
  - `truncateField` — short, long, null/undefined
  - `parseSlashDate` — MM/DD/YYYY, M/D/YY, 2-digit year, invalid
  - `parseDayMonthYear` — "DD Mon YYYY", case-insensitive, invalid
  - `parseRelativePostedDate` — today, yesterday, X days ago, null
  - `cleanHtml` script stripping — `<script>`, `<style>`, leaked JS functions

### 5. Repo Restructuring
- Deleted 102K lines of junk files:
  - `data.md` (10MB), `google-body.html` + `google-debug.html` (2.6MB), debug scripts, old planning docs, one-time migration scripts.
- Removed 37 unused shadcn/ui components (50 → 13).
- Moved docs to `docs/` folder.
- Cleaned `.gitignore` — removed duplicates (120 → 50 lines).

### 6. Companies Without Scrapers
- **American Airlines**: CDN (Akamai) blocks all headless browsers and direct curl. Skipped.
- **Infosys, Goldman Sachs, Intuit, Meta**: No posting dates available — using first-seen date pattern.

### 7. Anthropic & OpenAI Scrapers
- **Anthropic** (`scrape-anthropic-jobs.ts`): Greenhouse API (`boards-api.greenhouse.io/v1/boards/anthropic`). Real dates via `first_published`. 31 US jobs. 1-second runs.
- **OpenAI** (`scrape-openai-jobs.ts`): Ashby API (`api.ashbyhq.com/posting-api/job-board/openai`). Real dates via `publishedAt`. 50 US jobs. 1-second runs.
- Both are pure API scrapers — no browser needed.
- Added to `scrape-all-jobs.ts`. Total: 26 companies.

### 8. Zombie Job Prevention (Soft-Delete)
- **Problem**: Companies without posted dates (Meta, Intuit, Infosys, Goldman Sachs) use first-seen date. After 14-day cleanup deletes the job, the next scraper run re-inserts it with a fresh date — creating an infinite zombie cycle.
- **Fix**:
  - `cleanupOldJobs()` now sets `is_active = false` instead of `DELETE` (soft-delete).
  - `upsertJobsBatch()` with `preservePostedDate = true` now checks both active AND inactive rows. If an inactive row exists with an old date, that old date is restored — so the job stays old and gets deactivated again.
  - New `purgeInactiveJobs(180)` hard-deletes rows inactive for 180+ days to prevent storage growth.
  - Called from `scrape-all-jobs.ts`: `cleanupOldJobs(14)` then `purgeInactiveJobs(180)`.

### 9. GitHub Actions Schedule Update
- Changed from every 6 hours to 3x daily at specific times:
  - 7 AM CST (13:00 UTC)
  - 2 PM CST (20:00 UTC)
  - 10 PM CST (04:00 UTC)

### 10. Next.js Image Config
- Changed `next.config.mjs` image `remotePatterns` from whitelist to `{ protocol: 'https', hostname: '**' }` to allow any HTTPS image source. Prevents crashes when new companies with icons from unknown domains are added.

### 11. Scraper Reliability & Performance
- **Google scraper**: Added retry logic with 3 different user agents. Added fallback CSS selectors (structural `li > h3 + a[href*="/results/"]` patterns) for when Google rotates obfuscated class names.
- **Scraper health alerts**: Added "0 jobs" warning badge in Scraper Status table for scrapers that run successfully but return no jobs.
- **American Airlines**: Confirmed blocked by Akamai CDN — blocks all headless browsers, non-headless browsers, and direct curl. Uses SAP SuccessFactors but no public API. No workaround available.
- **Performance**: Split scrapers into API-only (7, parallel via Promise.all) and browser-based (19, sequential). Added `--api-only` and `--browser-only` flags. GitHub Actions split into two parallel jobs.

### 12. Company Icon Fixes
- Fixed 7 broken company icons (Infosys, Intuit, Staples, Texas Instruments, Walmart, Wells Fargo, Wipro).
- Root cause: Wikimedia Commons rate-limiting automated image requests (HTTP 429).
- Fix: Replaced Wikimedia URLs with reliable sources (`gstatic.com` favicons, `vectorlogo.zone` SVGs) in the `companies` DB table.
- Verified all 27 company icons load correctly via Playwright.

### Current State
- **26 active scrapers** covering 25 companies (American Airlines blocked by CDN).
- **10,500+ active jobs** in database.
- **0 stale jobs** (>14 days), **0 null dates**.
- All 27 company icons verified working.
- Zombie prevention via soft-delete for no-date companies.
- Tests: 33/33 passing. Build: passing.

---

## 2026-06-14

### 1. Dashboard Review Fixes
- Standardized project tooling on `pnpm` with Node 20 metadata, `.nvmrc`, CI workflow, and `typecheck`/`test:unit`/`test:live`/`ci` scripts.
- Removed tracked `package-lock.json`, kept `pnpm-lock.yaml`, and removed `typescript.ignoreBuildErrors`.
- Split live Supabase tests behind `pnpm test:live`; default tests now use deterministic fixture props.
- Moved shared job UI types/date formatting into `lib/job-types.ts`.
- Made app Supabase client lazy and typed with local schema fields including `end_date` and `Company_icon`.
- Moved scraper writes to the lazy service-role client via `SUPABASE_SERVICE_ROLE_KEY`.
- Updated scraper status persistence to `upsert(..., { onConflict: 'company_name' })`.
- Merged the stale `styles/globals.css` content into `app/globals.css` and removed the duplicate stylesheet.
- Removed client-side database imports from `JobDashboard` and `FilterSidebar`; filter options/counts now derive from loaded jobs.
- Added strict numeric job ID validation, accessible clear/pagination/filter labels, and fixture-based dashboard tests.
- Updated README, scraper docs, SQL lifecycle docs, env example, and GitHub scraper workflow notes.

### 2. Current Documentation/Run Request
- Added this concise June 14 log entry as the ongoing task record.
- Refreshed README commands to include `pnpm typecheck`, `pnpm test:unit`, `pnpm test:live`, and `pnpm ci`.
- Clarified scraper docs that writes use server-only `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Local Run Attempt
- Attempted `pnpm dev`; blocked because `pnpm` is not installed in the current shell.
- Checked local runtimes:
  - active NVM Node 25 crashes with a `dyld` libc++ symbol error,
  - Corepack is not installed,
  - Bun/Yarn are not installed,
  - Homebrew `node@20` alias points to the broken Node 22 install,
  - Homebrew Node 22 crashes because ICU `libicui18n.74.dylib` is missing.
- Approved Homebrew repair started but was interrupted after it hung for several minutes compiling `python@3.13`.
- Downloaded standalone Node `v20.20.2` to `/private/tmp` and used it only for this local run.
- Started the Next.js dev server with the standalone Node binary.
- Added `turbopack.root = process.cwd()` in `next.config.mjs` after Next warned about a parent `/Users/akhil/package-lock.json`.
- Verified local server:
  - `http://localhost:3000/support` returned `200 OK`,
  - `http://localhost:3000` returned `200 OK` after first-load warmup.
- Local URL for this run: `http://localhost:3000`.

### 4. UI Improvement Implementation
- Began implementing the scan-focused UI plan across dashboard, filters, job cards/list rows, job detail, scraper status, visual tokens, and tests.
- Reworked dashboard search into a compact command area with quick filters, persisted `Grid` / `List` view mode, quieter cards, dense list rows, and explicit `Details` / `Apply` actions.
- Extended filters with visa sponsorship and security clearance, added counts and `Apply (N results)` feedback, and kept search/filter/sort/page/view state in session storage.
- Added sticky job-detail apply/summary UI for desktop and mobile, plus tighter long-description sections.
- Added scraper status search, status chips, zero-job filtering, and sort controls.
- Reduced rounded/gradient-heavy UI treatments and aligned supporting loading/support surfaces with the calmer card radius.
- Added focused UI tests for filter counts, quick filters, view persistence, apply/details actions, job detail summary, and scraper status filtering/sorting.
- Added `jest.d.ts` for Jest DOM type coverage and fixed typecheck issues in mock data, department typing, and TI scraper DOM typing.
- Verification:
  - `pnpm install --frozen-lockfile` was attempted after hydrating pnpm 8.15.9 through Corepack; pnpm prompted to purge/recreate the existing pnpm-10 `node_modules`, so install was left untouched while the running app stayed up.
  - `pnpm typecheck` passed.
  - `pnpm test:unit` passed: 12 suites, 64 tests.
  - `pnpm build` passed after rerunning with network access for `next/font` Google Font fetches.
  - Local dev server is running at `http://localhost:3000`; `/` and `/support` returned `200 OK`.
  - `/jobs/123abc` renders the Next not-found page body; dev server reports `200` for the streamed not-found response.

### 5. AI Job Content Enrichment Implementation
- Began implementing post-DB Gemini enrichment so scrapers save first and AI rewrites existing rows later.
- Added AI metadata fields/types for `jobs`, plus `ai_enrichment_usage` quota tracking and SQL helper `scripts/sql/ai-enrichment.sql`.
- Added Gemini REST utilities for strict JSON output, prompt trimming, source hashing, enum normalization, and unchanged-source preservation.
- Added `scripts/enrich-jobs-ai.ts` and `pnpm enrich:ai` for manual batches with `--limit`, `--company`, `--status`, and `--dry-run`.
- Updated scraper upserts to store raw payloads/source hashes, mark new or changed jobs as `pending`, and preserve enriched fields when the source hash is unchanged.
- Added optional Phase 3 in the master scraper runner when `AI_ENRICHMENT_ENABLED=true`; enrichment failures do not block scraper completion.
- Updated `.env.example`, README, and scraper docs with Gemini config, quota behavior, SQL setup, and manual run commands.
- Verification:
  - `pnpm typecheck` passed.
  - `pnpm test:unit` passed: 14 suites, 78 tests.
  - `pnpm build` passed.
  - `git diff --check` passed.
  - Local dev server is still responding at `http://localhost:3000`.
