# Job Postings Dashboard - Phased Implementation Plan

## Project Overview

**Goal**: Build a job postings dashboard that aggregates live job postings from 20-30 top company career pages and displays them with search, filters, and other interactive features.

**Scope**: Focus on direct company career pages (excluding LinkedIn and job portals)

---

## Technology Stack

### Frontend
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Development**: Vercel v0 for initial generation, Cursor AI for ongoing development
- **Hosting**: Vercel or Netlify
- **State Management**: React Context API or Zustand (for complex state)

### Backend
- **Framework**: FastAPI (Python) - Fast, automatic API docs, async support
- **Alternative**: Express.js (Node.js) if JavaScript preferred
- **API Documentation**: Auto-generated Swagger/OpenAPI docs (FastAPI built-in)

### Database
- **Database**: PostgreSQL
- **Hosting**: Supabase (managed PostgreSQL with free tier) or Railway
- **ORM**: SQLAlchemy (Python) or Prisma (Node.js)

### Scraping & Data Collection
- **Primary Tool**: Playwright (handles both static HTML and JavaScript-rendered sites)
- **Backup Tool**: BeautifulSoup4 (for simple HTML parsing)
- **Browser Automation**: Playwright with headless browsers

### Job Queue & Scheduling
- **Queue System**: Celery + Redis (Python) or BullMQ (Node.js)
- **Scheduler**: Celery Beat for periodic tasks
- **Cron Jobs**: Alternative simple scheduler for initial implementation

### Deployment & Infrastructure
- **Backend Hosting**: Railway, Render, or DigitalOcean
- **Database**: Supabase, PlanetScale, or managed PostgreSQL
- **Frontend Hosting**: Vercel or Netlify
- **Caching**: Redis (for API response caching)
- **Monitoring**: Sentry (error tracking), Uptime Robot (monitoring)

---

## Phase 0: Research & Architecture

### Objectives
- Finalize target companies and understand their career page structures
- Design comprehensive system architecture
- Set up development environment and tooling
- Make key technical decisions

### Tasks

#### 0.1 Company Research
- [ ] Create list of 20-30 target companies
- [ ] Document career page URLs for each company
- [ ] Analyze page structures (static HTML vs JavaScript-rendered)
- [ ] Identify companies using common ATS platforms (Greenhouse, Lever, Workday, etc.)
- [ ] Check for available APIs or RSS feeds
- [ ] Review robots.txt and scraping policies
- [ ] Categorize companies by scraping difficulty (Easy/Medium/Hard)

#### 0.2 Architecture Design
- [ ] Design system architecture diagram
- [ ] Define data flow: Scraper → Database → API → Frontend
- [ ] Plan database schema with relationships
- [ ] Define API endpoints and request/response formats
- [ ] Determine scraping frequency and scheduling strategy
- [ ] Plan error handling and retry mechanisms
- [ ] Design monitoring and alerting strategy

#### 0.3 Data Field Definition
Define what data to capture for each job posting:
- **Required Fields**: job_title, company_name, job_url, location, posted_date
- **Optional Fields**: department, description, salary_range, employment_type, remote_type, requirements, benefits
- **Metadata**: scraped_at, last_seen_at, is_active

#### 0.4 Development Environment Setup
- [ ] Set up Git repository with proper .gitignore
- [ ] Create development, staging, and production environment configs
- [ ] Set up local PostgreSQL database
- [ ] Install development dependencies
- [ ] Configure IDE (VSCode/Cursor) with linters and formatters
- [ ] Set up virtual environment (Python) or node_modules

### Key Decisions
- [ ] Finalize primary programming language (Python recommended)
- [ ] Choose between monorepo vs separate frontend/backend repos
- [ ] Decide on authentication strategy (if needed)
- [ ] Determine scraping approach: headless browser vs HTTP requests vs APIs
- [ ] Select hosting providers based on budget

### Deliverables
- ✅ Company list with 20-30 targets and their career page URLs
- ✅ Categorization of companies by ATS platform
- ✅ System architecture diagram
- ✅ Database schema design document
- ✅ API specification document
- ✅ Development environment ready
- ✅ Project repository initialized

### Estimated Duration
**1-2 weeks** (can be done in parallel with Phase 1)

---

## Phase 1: Core Infrastructure

### Objectives
- Set up database with proper schema and indexes
- Build foundational backend API with core endpoints
- Create base scraper architecture that can be extended
- Establish reliable data pipeline

### Tasks

#### 1.1 Database Setup

**Schema Design**:

```sql
-- Companies Table
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    careers_url TEXT NOT NULL,
    ats_platform VARCHAR(50), -- 'greenhouse', 'lever', 'workday', 'custom'
    scraper_config JSONB, -- Store selectors, API endpoints, custom settings
    logo_url TEXT,
    website_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_scraped_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Jobs Table
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    job_id_external VARCHAR(255), -- Company's internal job ID
    job_title VARCHAR(500) NOT NULL,
    job_url TEXT NOT NULL UNIQUE,
    location VARCHAR(255),
    location_type VARCHAR(50), -- 'onsite', 'remote', 'hybrid'
    city VARCHAR(255),
    state VARCHAR(100),
    country VARCHAR(100),
    department VARCHAR(255),
    employment_type VARCHAR(50), -- 'full-time', 'part-time', 'contract', 'internship'
    salary_range VARCHAR(255),
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency VARCHAR(10),
    description TEXT,
    requirements TEXT,
    benefits TEXT,
    posted_date DATE,
    scraped_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Scrape Logs Table
CREATE TABLE scrape_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(50), -- 'success', 'failed', 'partial'
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    jobs_updated INTEGER DEFAULT 0,
    jobs_deactivated INTEGER DEFAULT 0,
    error_message TEXT,
    error_trace TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_active ON jobs(is_active) WHERE is_active = true;
CREATE INDEX idx_jobs_posted_date ON jobs(posted_date DESC);
CREATE INDEX idx_jobs_location ON jobs(location);
CREATE INDEX idx_jobs_department ON jobs(department);
CREATE INDEX idx_jobs_url ON jobs(job_url);
CREATE INDEX idx_companies_active ON companies(is_active) WHERE is_active = true;

-- Full-Text Search Index
CREATE INDEX idx_jobs_title_fts ON jobs USING gin(to_tsvector('english', job_title));
CREATE INDEX idx_jobs_description_fts ON jobs USING gin(to_tsvector('english', description));
```

**Tasks**:
- [ ] Create database and user with proper permissions
- [ ] Run migration scripts to create tables
- [ ] Set up database connection pooling
- [ ] Create database backup strategy
- [ ] Set up migrations tool (Alembic for Python, Prisma for Node.js)
- [ ] Seed initial companies data

#### 1.2 Backend API Foundation

**API Endpoints - Version 1**:

```
Health & Info:
GET  /api/health              # Health check
GET  /api/info                # API version and stats

Jobs:
GET  /api/jobs                # List jobs with pagination and filters
GET  /api/jobs/:id            # Get single job details
GET  /api/jobs/stats          # Job statistics

Companies:
GET  /api/companies           # List all companies
GET  /api/companies/:id       # Get company details
GET  /api/companies/:id/jobs  # Get jobs for specific company

Admin (optional):
POST /api/scrape/:company_id  # Trigger scrape for specific company
GET  /api/scrape/logs         # Get scrape logs
```

**Implementation Steps**:
- [ ] Set up FastAPI project structure
- [ ] Create database models (SQLAlchemy)
- [ ] Create Pydantic schemas for request/response validation
- [ ] Implement CRUD operations
- [ ] Add pagination helper functions
- [ ] Implement basic error handling
- [ ] Add request logging middleware
- [ ] Enable CORS for frontend
- [ ] Generate API documentation (auto-generated by FastAPI)
- [ ] Write basic API tests

**Key Features**:
- Pagination: offset/limit or cursor-based
- Filtering: company, location, department, date_range
- Sorting: posted_date, company_name, job_title
- Response format: consistent JSON structure with metadata

#### 1.3 Base Scraper Architecture

**Create Abstract Base Scraper**:

```python
# scrapers/base.py
from abc import ABC, abstractmethod
from typing import List, Dict
import logging

class BaseScraper(ABC):
    """
    Abstract base class for all job scrapers.
    Each company scraper inherits from this.
    """
    
    def __init__(self, company_id: int, company_name: str):
        self.company_id = company_id
        self.company_name = company_name
        self.logger = logging.getLogger(f"scraper.{company_name}")
        
    @abstractmethod
    async def scrape(self) -> List[Dict]:
        """
        Main scraping method - must be implemented by each scraper.
        Returns list of job dictionaries.
        """
        pass
    
    @abstractmethod
    def parse_job(self, element) -> Dict:
        """
        Parse individual job element into structured data.
        """
        pass
    
    def validate_job(self, job: Dict) -> bool:
        """
        Validate required fields are present.
        """
        required_fields = ['job_title', 'job_url']
        return all(field in job for field in required_fields)
    
    def normalize_location(self, location: str) -> Dict:
        """
        Normalize location string into structured data.
        """
        # Implementation for parsing location strings
        pass
    
    async def save_jobs(self, jobs: List[Dict]):
        """
        Save scraped jobs to database.
        """
        # Implementation for database operations
        pass
```

**Scraper Features**:
- [ ] Error handling with retry logic (exponential backoff)
- [ ] Rate limiting to avoid overwhelming servers
- [ ] User-agent rotation
- [ ] Request timeout handling
- [ ] Logging all scraper activity
- [ ] Data validation before saving
- [ ] Duplicate detection (by job_url)
- [ ] Job deactivation (mark jobs no longer on site as inactive)

#### 1.4 Data Pipeline

**Pipeline Flow**:
1. **Scrape**: Fetch HTML/data from career pages
2. **Parse**: Extract job data using selectors/APIs
3. **Validate**: Check data quality and required fields
4. **Transform**: Normalize locations, dates, salary formats
5. **Load**: Insert new jobs, update existing, deactivate missing
6. **Log**: Record scraping results and errors

**Implementation**:
- [ ] Create data transformation utilities
- [ ] Implement deduplication logic
- [ ] Build job activation/deactivation system
- [ ] Add data quality checks
- [ ] Create rollback mechanism for failed scrapes

### Deliverables
- ✅ PostgreSQL database with complete schema
- ✅ Working REST API with 5-7 core endpoints
- ✅ API documentation (Swagger UI)
- ✅ Base scraper class that can be extended
- ✅ Database models and ORM setup
- ✅ Data validation and transformation utilities
- ✅ Logging and error handling framework
- ✅ Unit tests for core functionality

### Estimated Duration
**2-3 weeks**

---

## Phase 2: Scraper Development

### Objectives
- Build scrapers for all target companies
- Prioritize ATS platform scrapers (one scraper = many companies)
- Implement scheduling system for automatic scraping
- Test data extraction accuracy and reliability

### Tasks

#### 2.1 ATS Platform Scrapers (Priority 1)

**Why ATS Scrapers First?**
Many companies use the same Applicant Tracking System (ATS) platforms. Building one scraper for each platform covers multiple companies efficiently.

**Common ATS Platforms**:

**A. Greenhouse Scraper**
Companies using Greenhouse (~30-40% of tech companies):
- Airbnb, Stripe, Slack, Coinbase, DoorDash, GitLab, Doordash, Robinhood, etc.

Implementation approach:
```python
# Greenhouse typically has a JSON API:
# https://boards-api.greenhouse.io/v1/boards/{company}/jobs

class GreenhouseScraper(BaseScraper):
    async def scrape(self):
        api_url = f"https://boards-api.greenhouse.io/v1/boards/{self.company_slug}/jobs"
        # Fetch and parse JSON response
```

- [ ] Identify Greenhouse companies from target list
- [ ] Build Greenhouse API scraper
- [ ] Handle pagination in Greenhouse API
- [ ] Parse location, department, and job details
- [ ] Test with 3-5 companies
- [ ] Deploy to production

**B. Lever Scraper**
Companies using Lever:
- Netflix, Shopify, Canva, Figma, Grammarly, etc.

Implementation approach:
```python
# Lever also has a JSON API:
# https://api.lever.co/v0/postings/{company}?mode=json

class LeverScraper(BaseScraper):
    async def scrape(self):
        api_url = f"https://api.lever.co/v0/postings/{self.company_slug}?mode=json"
        # Fetch and parse JSON response
```

- [ ] Identify Lever companies from target list
- [ ] Build Lever API scraper
- [ ] Handle nested categories and teams
- [ ] Parse commitment (full-time, part-time, etc.)
- [ ] Test with 3-5 companies
- [ ] Deploy to production

**C. Workday Scraper**
Companies using Workday:
- Amazon, Google, Microsoft, Apple, Meta, Netflix (some divisions), etc.

Implementation approach:
```python
# Workday is more complex - often requires Playwright
# URL pattern: {company}.wd1.myworkdayjobs.com/en-US/{site}/jobs

class WorkdayScraper(BaseScraper):
    async def scrape(self):
        # Use Playwright to handle JavaScript rendering
        # Scrape job listings from search results page
```

- [ ] Identify Workday companies from target list
- [ ] Build Workday scraper using Playwright
- [ ] Handle lazy loading and infinite scroll
- [ ] Extract job details from dynamically loaded content
- [ ] Test with 3-5 companies
- [ ] Deploy to production

**D. SmartRecruiters Scraper**
Companies using SmartRecruiters:
- Bosch, Visa, LinkedIn (ironically), etc.

- [ ] Build SmartRecruiters scraper
- [ ] Test and deploy

**E. iCIMS Scraper**
Companies using iCIMS:
- Various enterprise companies

- [ ] Build iCIMS scraper
- [ ] Test and deploy

#### 2.2 Custom Company Scrapers (Priority 2)

For companies with custom career pages not using standard ATS platforms:

**Scraper Implementation Strategy**:

1. **Analyze page structure**:
   - View page source
   - Identify job listing containers
   - Find selectors for: title, location, department, URL
   - Check if JavaScript-rendered (needs Playwright) or static HTML (BeautifulSoup)

2. **Build scraper**:
```python
class CustomCompanyScraper(BaseScraper):
    async def scrape(self):
        if self.requires_javascript:
            # Use Playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page()
                await page.goto(self.careers_url)
                # Extract jobs
        else:
            # Use requests + BeautifulSoup
            response = requests.get(self.careers_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            # Extract jobs
```

3. **Test and validate**:
   - Verify all required fields are extracted
   - Check data quality
   - Test with edge cases

**Custom Scrapers to Build** (5-10 companies):
- [ ] Company 1 (e.g., Notion)
- [ ] Company 2 (e.g., Linear)
- [ ] Company 3 (e.g., Vercel)
- [ ] Company 4 (e.g., OpenAI)
- [ ] Company 5 (e.g., Anthropic)
- [ ] Additional custom scrapers as needed

#### 2.3 Scheduling System

**Implement Automatic Scraping**:

**Option A: Celery + Redis (Recommended for production)**

```python
# tasks/scraping.py
from celery import Celery
from celery.schedules import crontab

app = Celery('job_scraper', broker='redis://localhost:6379/0')

@app.task
def scrape_all_companies():
    """Scrape all active companies."""
    companies = get_active_companies()
    for company in companies:
        scrape_company.delay(company.id)

@app.task
def scrape_company(company_id):
    """Scrape a specific company."""
    scraper = get_scraper_for_company(company_id)
    scraper.scrape()

# Schedule periodic scraping
app.conf.beat_schedule = {
    'scrape-every-4-hours': {
        'task': 'tasks.scraping.scrape_all_companies',
        'schedule': crontab(minute=0, hour='*/4'),  # Every 4 hours
    },
}
```

**Option B: Simple Cron Jobs** (For MVP/initial implementation)

```bash
# crontab entry
0 */4 * * * /path/to/python /path/to/scraper.py >> /path/to/logs/scraper.log 2>&1
```

**Scheduling Strategy**:
- **Frequency**: Every 2-6 hours (adjustable per company)
- **Staggering**: Don't scrape all companies at once - stagger by 5-10 minutes
- **Off-peak hours**: Prefer scraping during off-peak hours (2-6 AM)
- **Error handling**: Retry failed scrapes after 1 hour
- **Rate limiting**: Respect company servers, add delays between requests

**Implementation Tasks**:
- [ ] Set up Celery + Redis OR cron jobs
- [ ] Create scheduling configuration
- [ ] Implement task queue for parallel scraping
- [ ] Add retry logic for failed scrapes
- [ ] Create monitoring for scheduled tasks
- [ ] Set up alerts for consecutive failures
- [ ] Log all scraping activity with timestamps

#### 2.4 Data Quality & Monitoring

**Data Quality Checks**:
- [ ] Validate required fields present (title, URL, company)
- [ ] Check for duplicate jobs (same URL)
- [ ] Verify URLs are valid and accessible
- [ ] Normalize date formats
- [ ] Clean and normalize location data
- [ ] Detect and flag suspicious data (e.g., missing all jobs suddenly)

**Scraper Monitoring**:
- [ ] Track scrape success/failure rates
- [ ] Monitor scrape duration (alert if too slow)
- [ ] Alert on zero jobs found (likely scraper broken)
- [ ] Alert on consecutive failures (3+ times)
- [ ] Track job count trends (detect anomalies)
- [ ] Log error messages with stack traces

**Scraper Health Dashboard** (simple admin view):
- Last scrape time per company
- Success/failure status
- Jobs found in last scrape
- Error messages
- Average scrape duration

### Deliverables
- ✅ 3-4 ATS platform scrapers (covers 15-20 companies)
- ✅ 5-10 custom company scrapers
- ✅ Total coverage: 20-30 companies
- ✅ Working scheduler (Celery or cron)
- ✅ Automated scraping every 2-6 hours
- ✅ Data quality validation pipeline
- ✅ Scraper monitoring and alerting
- ✅ Scraper health dashboard (basic)
- ✅ Comprehensive logging

### Estimated Duration
**3-4 weeks**

---

## Phase 3: Data Enhancement & API Expansion

### Objectives
- Enrich and normalize job data for better user experience
- Build comprehensive API with advanced search and filtering
- Implement full-text search functionality
- Add analytics and statistics endpoints

### Tasks

#### 3.1 Data Processing & Enrichment

**Location Normalization**:
```python
def normalize_location(location_string: str) -> Dict:
    """
    Parse and normalize location strings.
    
    Input: "San Francisco, CA", "Remote - US", "New York, NY / Remote"
    Output: {
        'city': 'San Francisco',
        'state': 'CA',
        'country': 'US',
        'location_type': 'onsite',  # or 'remote', 'hybrid'
        'is_remote': False
    }
    """
    # Implementation using regex and location databases
```

Tasks:
- [ ] Build location parser with regex patterns
- [ ] Create city/state/country mapping database
- [ ] Detect remote/hybrid/onsite from keywords
- [ ] Handle edge cases (international locations, multiple offices)
- [ ] Backfill existing jobs with normalized locations

**Salary Extraction** (when available):
- [ ] Parse salary ranges from descriptions ("$120K - $180K")
- [ ] Extract salary from structured fields
- [ ] Normalize to annual salary in USD
- [ ] Store min/max/currency separately
- [ ] Handle different formats (hourly, monthly, annual)

**Department Categorization**:
```python
DEPARTMENT_CATEGORIES = {
    'Engineering': ['software', 'engineer', 'developer', 'backend', 'frontend', 'devops'],
    'Product': ['product manager', 'product owner', 'product lead'],
    'Design': ['designer', 'ux', 'ui', 'visual design'],
    'Sales': ['sales', 'account executive', 'business development'],
    'Marketing': ['marketing', 'growth', 'content', 'brand'],
    'Data': ['data scientist', 'data analyst', 'data engineer', 'ml engineer'],
    'Operations': ['operations', 'ops', 'supply chain'],
    'Customer Success': ['customer success', 'support', 'customer service'],
    'Finance': ['finance', 'accounting', 'controller'],
    'HR': ['human resources', 'recruiter', 'people ops'],
}
```

- [ ] Implement department categorization based on title/description
- [ ] Create mapping from job titles to standardized departments
- [ ] Backfill existing jobs with categories

**Employment Type Detection**:
- [ ] Detect from title: "Intern", "Contract", "Part-time"
- [ ] Parse from job details
- [ ] Default to "Full-time" if not specified

**Duplicate Detection Across Companies**:
- [ ] Identify jobs posted by multiple companies (same role, outsourced)
- [ ] Flag duplicate job descriptions
- [ ] Consider fuzzy matching for similar jobs

**Job Deactivation Logic**:
```python
def deactivate_missing_jobs():
    """
    Mark jobs as inactive if they're no longer on the company's career page.
    
    Logic:
    1. After each successful scrape, get list of current job URLs
    2. Compare with existing active jobs in database
    3. Jobs not in current scrape but in DB = deactivated
    4. Update is_active = False, record last_seen_at
    """
```

- [ ] Implement job deactivation after each scrape
- [ ] Keep inactive jobs in database for historical data
- [ ] Track when jobs were last seen

#### 3.2 Advanced API Endpoints

**Search Endpoint**:
```
GET /api/jobs/search?q=backend+engineer&company=Google,Meta&location=Remote
```

Query parameters:
- `q`: Search query (full-text search on title and description)
- `company`: Filter by company name(s) (comma-separated)
- `location`: Filter by location
- `department`: Filter by department
- `employment_type`: Filter by type (full-time, contract, etc.)
- `location_type`: Filter by remote/hybrid/onsite
- `posted_after`: Filter by date (ISO format or relative like "7d")
- `posted_before`: Filter by date
- `salary_min`: Minimum salary
- `salary_max`: Maximum salary
- `page`: Page number (default: 1)
- `per_page`: Results per page (default: 20, max: 100)
- `sort`: Sort field (posted_date, company, title)
- `order`: Sort order (asc, desc)

Response:
```json
{
  "meta": {
    "total": 150,
    "page": 1,
    "per_page": 20,
    "pages": 8,
    "query": "backend engineer"
  },
  "filters_applied": {
    "company": ["Google", "Meta"],
    "location": ["Remote"]
  },
  "data": [
    {
      "id": 123,
      "company": {
        "id": 5,
        "name": "Google",
        "logo_url": "..."
      },
      "job_title": "Senior Backend Engineer",
      "location": "Remote - US",
      "location_type": "remote",
      "department": "Engineering",
      "employment_type": "Full-time",
      "posted_date": "2024-02-10",
      "job_url": "https://...",
      "description_snippet": "We're looking for...",
      "salary_range": "$150K - $200K"
    }
  ]
}
```

**Filter Options Endpoint**:
```
GET /api/filters
```

Returns available filter values:
```json
{
  "companies": [
    {"id": 1, "name": "Google", "job_count": 45},
    {"id": 2, "name": "Meta", "job_count": 32}
  ],
  "departments": [
    {"name": "Engineering", "job_count": 120},
    {"name": "Product", "job_count": 35}
  ],
  "locations": [
    {"location": "Remote", "job_count": 80},
    {"location": "San Francisco, CA", "job_count": 45}
  ],
  "employment_types": [
    {"type": "Full-time", "job_count": 180},
    {"type": "Contract", "job_count": 15}
  ],
  "location_types": [
    {"type": "remote", "job_count": 80},
    {"type": "onsite", "job_count": 65},
    {"type": "hybrid", "job_count": 40}
  ]
}
```

**Statistics Endpoint**:
```
GET /api/stats
```

Returns dashboard statistics:
```json
{
  "total_jobs": 185,
  "total_companies": 28,
  "new_today": 12,
  "new_this_week": 45,
  "jobs_by_department": {
    "Engineering": 95,
    "Product": 30,
    "Design": 20
  },
  "jobs_by_location_type": {
    "remote": 80,
    "onsite": 65,
    "hybrid": 40
  },
  "top_companies": [
    {"name": "Google", "job_count": 45},
    {"name": "Meta", "job_count": 32}
  ],
  "last_updated": "2024-02-16T14:30:00Z"
}
```

#### 3.3 Full-Text Search Implementation

**PostgreSQL Full-Text Search**:
```sql
-- Create text search configuration
CREATE TEXT SEARCH CONFIGURATION job_search (COPY = english);

-- Create GIN indexes
CREATE INDEX idx_jobs_title_search ON jobs 
  USING gin(to_tsvector('job_search', job_title));

CREATE INDEX idx_jobs_desc_search ON jobs 
  USING gin(to_tsvector('job_search', description));

-- Search query example
SELECT * FROM jobs
WHERE to_tsvector('job_search', job_title || ' ' || description) 
  @@ to_tsquery('job_search', 'backend & engineer');
```

Tasks:
- [ ] Implement PostgreSQL full-text search (MVP)
- [ ] Add search ranking/relevance scoring
- [ ] Highlight matching terms in results
- [ ] Consider Elasticsearch for production (if needed)
- [ ] Implement search autocomplete/suggestions

#### 3.4 Performance Optimization

**Caching Strategy**:
```python
# Cache frequently accessed data
@cache(ttl=300)  # 5 minutes
def get_filter_options():
    # Expensive query to get all filter options
    pass

@cache(ttl=600)  # 10 minutes
def get_stats():
    # Dashboard statistics
    pass
```

Tasks:
- [ ] Set up Redis for caching
- [ ] Cache filter options (refresh every 5-10 minutes)
- [ ] Cache statistics (refresh every 10-15 minutes)
- [ ] Cache search results (with query as key)
- [ ] Implement cache invalidation on data updates
- [ ] Add cache hit/miss monitoring

**Database Optimization**:
- [ ] Analyze slow queries with EXPLAIN
- [ ] Add missing indexes based on query patterns
- [ ] Optimize JOIN queries
- [ ] Implement database connection pooling
- [ ] Consider read replicas for scaling

### Deliverables
- ✅ Normalized and enriched job data (location, department, salary)
- ✅ Comprehensive REST API with 10-15 endpoints
- ✅ Full-text search functionality
- ✅ Advanced filtering and sorting
- ✅ Statistics and analytics endpoints
- ✅ API caching with Redis
- ✅ Optimized database queries
- ✅ API documentation updated
- ✅ Performance monitoring

### Estimated Duration
**2-3 weeks**

---

## Phase 4: Frontend Development

### Objectives
- Build modern, responsive job dashboard UI using AI tools
- Implement search and filtering functionality
- Create interactive user experience
- Connect frontend to backend API

### Approach
Use AI-assisted development with Vercel v0 or Claude Artifacts for rapid UI generation, then refine with Cursor AI.

### Vercel v0 Prompt

Use this prompt to generate the initial frontend:

```
Create a modern job listings dashboard with the following specifications:

LAYOUT & STRUCTURE:
- Full-width responsive layout with sidebar for filters and main content area
- Top navigation: logo "Job Dashboard", centered search bar, stats counter "X jobs from Y companies"
- Left sidebar (collapsible on mobile) with filters
- Main content: job cards in grid/list view
- Sticky sidebar on desktop, drawer on mobile

FILTER SIDEBAR:
1. Companies - Multi-select checkboxes with search, job count per company, "Select All"
2. Location - Multi-select: Remote, Hybrid, Onsite, then by city
3. Department - Multi-select: Engineering, Product, Design, Sales, Marketing, Operations, etc.
4. Date Posted - Radio: Today, Last 7 days, Last 30 days, All time
5. Employment Type - Checkboxes: Full-time, Part-time, Contract, Internship
- "Clear All Filters" button
- Active filter count badge

SEARCH BAR:
- Large search in top nav
- Placeholder: "Search jobs by title, skills, or keywords..."
- Real-time debounced search
- Clear button when text entered

JOB CARDS:
- Company name + logo placeholder (colored circle with initial)
- Job title (bold)
- Location with pin icon
- Department badge
- Posted date (relative: "2 days ago")
- Description snippet (2 lines)
- "View Details" button or clickable card
- Hover: subtle shadow and scale

VISUAL DESIGN:
- Professional design (shadcn/ui style)
- Primary: Blue (#3B82F6)
- Background: Light gray (#F9FAFB)
- Cards: White with border
- Clean typography, proper spacing

HEADER STATS:
- "Showing X jobs"
- Active filters summary
- Sort dropdown: Most Recent, Company A-Z, Title A-Z

PAGINATION:
- Page numbers with prev/next
- "Showing 1-20 of 150 jobs"

EMPTY STATES:
- No results: "No jobs found" + "Clear Filters" button
- Loading: Skeleton cards

RESPONSIVE:
- Desktop: Two-column
- Tablet: Collapsible sidebar
- Mobile: Full-width, filters in drawer

Use React + TypeScript + Tailwind CSS + shadcn/ui. Include mock data for 25 jobs.
```

### Tasks

#### 4.1 Component Development
- [ ] Generate initial UI with v0 or Claude
- [ ] Export code to local environment
- [ ] Build JobCard component
- [ ] Build SearchBar with debouncing
- [ ] Build FilterSidebar with multi-select
- [ ] Build Pagination component
- [ ] Build job detail modal/page
- [ ] Build loading skeletons and empty states

#### 4.2 API Integration
- [ ] Create API service layer
- [ ] Implement error handling
- [ ] Set up state management (Context or Zustand)
- [ ] Create custom hooks (useJobs, useFilters)
- [ ] Connect components to API
- [ ] Handle loading states

#### 4.3 Features
- [ ] Real-time search with debouncing
- [ ] Multi-select filters
- [ ] Active filter chips
- [ ] URL state management
- [ ] Sorting functionality
- [ ] Pagination
- [ ] Job details modal
- [ ] Responsive design

#### 4.4 Polish
- [ ] Loading states and skeletons
- [ ] Empty state messages
- [ ] Hover animations
- [ ] Keyboard navigation
- [ ] Accessibility (ARIA labels)
- [ ] Dark mode (optional)

### Deliverables
- ✅ Complete React dashboard
- ✅ All components built and tested
- ✅ API integration working
- ✅ Search and filtering functional
- ✅ Responsive design
- ✅ Accessible UI
- ✅ Deployed to Vercel

### Estimated Duration
**2-3 weeks**

---

## Phase 5: Monitoring & Reliability

### Objectives
- Ensure scrapers run reliably
- Monitor data quality and system health
- Set up alerting for critical issues
- Build admin dashboard

### Tasks

#### 5.1 Scraper Monitoring
- [ ] Track scrape success/failure rates
- [ ] Monitor scrape duration
- [ ] Alert on zero jobs found
- [ ] Alert on consecutive failures
- [ ] Track job count trends
- [ ] Log error messages

#### 5.2 Alerting System
- [ ] Set up email notifications
- [ ] Set up Slack/Discord webhook
- [ ] Implement alert routing
- [ ] Create alert dashboard
- [ ] Add alert throttling

#### 5.3 Data Quality Monitoring
- [ ] Implement quality scoring
- [ ] Monitor field completeness
- [ ] Detect anomalies
- [ ] Run quality reports

#### 5.4 Admin Dashboard
- [ ] Build admin UI
- [ ] Show system health
- [ ] Display scraper status
- [ ] Show recent logs
- [ ] Add manual scrape triggers
- [ ] Implement authentication

#### 5.5 Error Handling
- [ ] Graceful degradation
- [ ] Automatic retry logic
- [ ] Structured logging
- [ ] Error tracking (Sentry)

### Deliverables
- ✅ Monitoring system
- ✅ Alerting on issues
- ✅ Admin dashboard
- ✅ Data quality monitoring
- ✅ Error recovery
- ✅ Centralized logging

### Estimated Duration
**2-3 weeks**

---

## Phase 6: Optimization & Scaling

### Objectives
- Optimize performance
- Scale to more companies and users
- Add advanced features
- Production readiness

### Tasks

#### 6.1 Performance Optimization
- [ ] Database query optimization
- [ ] API response caching (Redis)
- [ ] Frontend code splitting
- [ ] Image lazy loading
- [ ] CDN for static assets

#### 6.2 Scalability
- [ ] Deploy multiple API servers
- [ ] Set up load balancer
- [ ] Database read replicas
- [ ] Distributed scraping (Celery workers)
- [ ] Infrastructure as code (Docker)

#### 6.3 Advanced Features
- [ ] Email job alerts
- [ ] Job recommendations
- [ ] Analytics dashboard
- [ ] CSV/Excel export
- [ ] Save/bookmark jobs
- [ ] Application tracking

#### 6.4 Company Expansion
- [ ] Scale from 30 → 50 → 100 companies
- [ ] Add 20 companies using existing scrapers
- [ ] Build 10 new custom scrapers
- [ ] Test and monitor new companies

#### 6.5 Production Readiness
- [ ] HTTPS setup
- [ ] Rate limiting
- [ ] Security audit
- [ ] Uptime monitoring
- [ ] Database backups
- [ ] Documentation
- [ ] Load testing

### Deliverables
- ✅ Optimized API (< 200ms)
- ✅ Scalable infrastructure
- ✅ Advanced features
- ✅ 50-100 companies
- ✅ Production-ready system
- ✅ CI/CD pipeline
- ✅ Documentation

### Estimated Duration
**3-4 weeks**

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 0 | 1-2 weeks | Research & Architecture |
| Phase 1 | 2-3 weeks | Core Infrastructure |
| Phase 2 | 3-4 weeks | Scraper Development |
| Phase 3 | 2-3 weeks | Data Enhancement & API |
| Phase 4 | 2-3 weeks | Frontend Development |
| Phase 5 | 2-3 weeks | Monitoring & Reliability |
| Phase 6 | 3-4 weeks | Optimization & Scaling |

**Total: 4-6 months**

---

## Success Metrics

**Coverage**:
- ✅ 20-30 companies (MVP)
- ✅ 50+ companies (production)
- ✅ 90%+ scraper uptime
- ✅ < 6 hour data freshness

**Performance**:
- ✅ API < 200ms (p95)
- ✅ Page load < 2 seconds
- ✅ Search < 1 second

**Quality**:
- ✅ 95%+ data quality
- ✅ < 1% duplicates
- ✅ 98%+ scraper success

---

## Risk Mitigation

1. **Websites Change** → Monitor health, easy config updates
2. **Rate Limiting** → Respect robots.txt, delays, proxies
3. **Scale Issues** → Design for scale, caching, load balancing
4. **Data Quality** → Validation, monitoring, manual review
5. **Legal Concerns** → Public data only, respect ToS

---

## Quick Start MVP

For fastest MVP (4-6 weeks):
1. Build 3 ATS scrapers (covers 15+ companies)
2. Use v0/Claude for frontend
3. Simple cron scheduling
4. Deploy to free tier (Railway + Vercel)
5. Start with 10 companies, expand to 30
