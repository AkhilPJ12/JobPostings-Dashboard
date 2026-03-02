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
            expect(determineLocationType('San Jose, CA')).toBe('Onsite')
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
            expect(determineEmploymentType('Senior Backend Engineer')).toBe('Full-time')
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
})
