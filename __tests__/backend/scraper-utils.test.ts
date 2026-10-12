import {
    detectSecurityClearance,
    detectH1BSponsorship,
    isUSA,
    isUSLocation,
    parsePostedDate,
    isWithinDaysOrFuture,
    isWithinDays,
    cleanHtml,
    createSummary,
    parseQualifications,
    extractPayRange,
    determineLocationType,
    determineEmploymentType,
    randomDelay,
    truncateField,
    parseSlashDate,
    parseDayMonthYear,
    parseRelativePostedDate,
} from '@/scripts/scraper-utils'

describe('Scraper Utils', () => {
    describe('date parsing and filtering', () => {
        it('parses long-form dates', () => {
            const parsed = parsePostedDate('February 18, 2026')
            expect(parsed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        })

        it('parses epoch milliseconds', () => {
            const ts = Date.UTC(2026, 1, 20) // 2026-02-20 UTC
            expect(parsePostedDate(ts)).toBe('2026-02-20')
        })

        it('returns null for invalid date text', () => {
            expect(parsePostedDate('not-a-real-date')).toBeNull()
        })

        it('accepts recent dates in date window checks', () => {
            const d = new Date()
            d.setDate(d.getDate() - 2)
            const iso = d.toISOString().split('T')[0]
            expect(isWithinDays(iso, 14)).toBe(true)
            expect(isWithinDaysOrFuture(iso, 14)).toBe(true)
        })

        it('accepts future dates for isWithinDaysOrFuture', () => {
            const d = new Date()
            d.setDate(d.getDate() + 5)
            const iso = d.toISOString().split('T')[0]
            expect(isWithinDaysOrFuture(iso, 14)).toBe(true)
            expect(isWithinDays(iso, 14)).toBe(true)
        })
    })

    describe('location helpers', () => {
        it('detects USA aliases', () => {
            expect(isUSA('USA')).toBe(true)
            expect(isUSA('United States')).toBe(true)
            expect(isUSA('Canada')).toBe(false)
        })

        it('detects US locations with state code and country text', () => {
            expect(isUSLocation('Seattle, WA')).toBe(true)
            expect(isUSLocation('Austin, Texas')).toBe(true)
            expect(isUSLocation('London, UK')).toBe(false)
        })

        it('determines location type from text', () => {
            expect(determineLocationType('Remote - US')).toBe('Remote')
            expect(determineLocationType('NYC', 'Hybrid schedule')).toBe('Hybrid')
            expect(determineLocationType('San Jose, CA')).toBeNull()
        })
    })

    describe('text extraction', () => {
        it('cleans html and preserves readable content', () => {
            const text = cleanHtml('<p>Hello&nbsp;World<br/>Line 2</p>')
            expect(text).toContain('Hello World')
            expect(text).toContain('Line 2')
        })

        it('creates summary with truncation', () => {
            const long = 'A'.repeat(220)
            const summary = createSummary(long, 50)
            expect(summary.length).toBeLessThanOrEqual(53) // includes ellipsis
            expect(summary.endsWith('...')).toBe(true)
        })

        it('parses qualifications into bullet-like entries', () => {
            const quals = parseQualifications('• 5+ years Node.js\n• SQL experience\n- Communication')
            expect(quals.length).toBeGreaterThanOrEqual(2)
            expect(quals.some(q => q.toLowerCase().includes('node'))).toBe(true)
        })

        it('extracts pay range patterns', () => {
            const text = 'Compensation range: $120,000 - $180,000 per year'
            const pay = extractPayRange(text)
            expect(pay).toContain('$120,000')
            expect(pay).toContain('$180,000')
        })
    })

    describe('classification helpers', () => {
        it('detects security clearance requirements', () => {
            expect(detectSecurityClearance('Must hold active TS/SCI clearance')).toBe('Yes')
            expect(detectSecurityClearance('No clearance mentioned')).toBe('No')
        })

        it('detects H1B sponsorship stance', () => {
            expect(detectH1BSponsorship('Sponsorship is available for this role')).toBe('Yes')
            expect(detectH1BSponsorship('No immigration sponsorship available')).toBe('No')
            expect(detectH1BSponsorship('Great team and culture')).toBe('N/A')
        })

        it('determines employment type from title text', () => {
            expect(determineEmploymentType('Software Engineering Intern')).toBe('Internship')
            expect(determineEmploymentType('Contract Data Analyst')).toBe('Contract')
            expect(determineEmploymentType('Part-time Support Specialist')).toBe('Part-time')
            expect(determineEmploymentType('Senior Backend Engineer')).toBeNull()
        })
    })

    describe('random delay', () => {
        it('returns a value within configured range', () => {
            const min = 50
            const max = 100
            for (let i = 0; i < 100; i++) {
                const v = randomDelay(min, max)
                expect(v).toBeGreaterThanOrEqual(min)
                expect(v).toBeLessThanOrEqual(max)
            }
        })
    })

    describe('truncateField', () => {
        it('returns short strings unchanged', () => {
            expect(truncateField('hello')).toBe('hello')
        })

        it('truncates strings exceeding max length', () => {
            const long = 'A'.repeat(300)
            expect(truncateField(long)).toHaveLength(250)
            expect(truncateField(long, 100)).toHaveLength(100)
        })

        it('returns empty string for null/undefined', () => {
            expect(truncateField(null)).toBe('')
            expect(truncateField(undefined)).toBe('')
            expect(truncateField('')).toBe('')
        })
    })

    describe('parseSlashDate', () => {
        it('parses MM/DD/YYYY format', () => {
            expect(parseSlashDate('03/30/2026')).toBe('2026-03-30')
            expect(parseSlashDate('12/31/2025')).toBe('2025-12-31')
        })

        it('parses M/D/YYYY with single digits', () => {
            expect(parseSlashDate('3/5/2026')).toBe('2026-03-05')
        })

        it('parses 2-digit year as 20xx', () => {
            expect(parseSlashDate('3/30/26')).toBe('2026-03-30')
        })

        it('returns null for invalid input', () => {
            expect(parseSlashDate('not a date')).toBeNull()
            expect(parseSlashDate('')).toBeNull()
        })
    })

    describe('parseDayMonthYear', () => {
        it('parses "DD Mon YYYY" format', () => {
            expect(parseDayMonthYear('30 Mar 2026')).toBe('2026-03-30')
            expect(parseDayMonthYear('1 Jan 2025')).toBe('2025-01-01')
            expect(parseDayMonthYear('15 December 2026')).toBeNull() // only 3-letter month abbrev
        })

        it('is case-insensitive', () => {
            expect(parseDayMonthYear('30 mar 2026')).toBe('2026-03-30')
            expect(parseDayMonthYear('30 MAR 2026')).toBe('2026-03-30')
        })

        it('returns null for invalid input', () => {
            expect(parseDayMonthYear('not a date')).toBeNull()
            expect(parseDayMonthYear('2026-03-30')).toBeNull()
        })
    })

    describe('parseRelativePostedDate', () => {
        it('parses "Posted today"', () => {
            const today = new Date().toISOString().split('T')[0]
            expect(parseRelativePostedDate('Posted today')).toBe(today)
            expect(parseRelativePostedDate('Posted Today')).toBe(today)
        })

        it('parses "Posted yesterday"', () => {
            const d = new Date(); d.setDate(d.getDate() - 1)
            expect(parseRelativePostedDate('Posted yesterday')).toBe(d.toISOString().split('T')[0])
        })

        it('parses "Posted X days ago"', () => {
            const d = new Date(); d.setDate(d.getDate() - 5)
            expect(parseRelativePostedDate('Posted 5 days ago')).toBe(d.toISOString().split('T')[0])
            const d1 = new Date(); d1.setDate(d1.getDate() - 1)
            expect(parseRelativePostedDate('Posted 1 day ago')).toBe(d1.toISOString().split('T')[0])
        })

        it('returns null for null/undefined/empty', () => {
            expect(parseRelativePostedDate(null)).toBeNull()
            expect(parseRelativePostedDate(undefined)).toBeNull()
            expect(parseRelativePostedDate('')).toBeNull()
        })
    })

    describe('cleanHtml - script stripping', () => {
        it('strips script tags and their content', () => {
            const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
            const text = cleanHtml(html)
            expect(text).toContain('Hello')
            expect(text).toContain('World')
            expect(text).not.toContain('alert')
            expect(text).not.toContain('script')
        })

        it('strips style tags', () => {
            const html = '<style>.foo { color: red; }</style><p>Content</p>'
            const text = cleanHtml(html)
            expect(text).toContain('Content')
            expect(text).not.toContain('color')
        })

        it('strips leaked JS function patterns', () => {
            const text = cleanHtml('Hello function OptanonWrapper() { window.OneTrust.OnConsentChanged(function () { }); } World')
            expect(text).not.toContain('OptanonWrapper')
            expect(text).toContain('Hello')
            expect(text).toContain('World')
        })
    })
})
