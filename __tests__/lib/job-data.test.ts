import {
    getUniqueCompanies,
    getUniqueDepartments,
    getUniqueLocationTypes,
    getJobById,
    getJobCountByCompany,
    getUniqueCompanyCount,
    formatRelativeDate,
    jobs,
} from '@/lib/job-data'

describe('job-data utilities', () => {
    describe('getUniqueCompanies', () => {
        it('should return a sorted array of unique company names', () => {
            const companies = getUniqueCompanies()
            expect(companies).toBeInstanceOf(Array)
            expect(companies.length).toBeGreaterThan(0)
            expect(companies).toEqual([...companies].sort())
            // Check for uniqueness
            expect(new Set(companies).size).toBe(companies.length)
        })
    })

    describe('getUniqueDepartments', () => {
        it('should return a sorted array of unique departments', () => {
            const departments = getUniqueDepartments()
            expect(departments).toBeInstanceOf(Array)
            expect(departments.length).toBeGreaterThan(0)
            expect(departments).toEqual([...departments].sort())
            // Check for uniqueness
            expect(new Set(departments).size).toBe(departments.length)
        })
    })

    describe('getUniqueLocationTypes', () => {
        it('should return Remote, Hybrid, and Onsite', () => {
            const locationTypes = getUniqueLocationTypes()
            expect(locationTypes).toEqual(['Remote', 'Hybrid', 'Onsite'])
        })
    })

    describe('getJobById', () => {
        it('should return the correct job when given a valid id', () => {
            const job = getJobById('1')
            expect(job).toBeDefined()
            expect(job?.id).toBe('1')
        })

        it('should return undefined when given an invalid id', () => {
            const job = getJobById('invalid-id')
            expect(job).toBeUndefined()
        })
    })

    describe('getJobCountByCompany', () => {
        it('should return the correct count for a company', () => {
            const companies = getUniqueCompanies()
            const firstCompany = companies[0]
            const count = getJobCountByCompany(firstCompany)
            expect(count).toBeGreaterThan(0)

            // Verify by filtering jobs manually
            const manualCount = jobs.filter(j => j.company === firstCompany).length
            expect(count).toBe(manualCount)
        })

        it('should return 0 for a non-existent company', () => {
            const count = getJobCountByCompany('Non-existent Company')
            expect(count).toBe(0)
        })
    })

    describe('getUniqueCompanyCount', () => {
        it('should return the correct number of unique companies', () => {
            const count = getUniqueCompanyCount()
            const uniqueCompanies = getUniqueCompanies()
            expect(count).toBe(uniqueCompanies.length)
        })
    })

    describe('formatRelativeDate', () => {
        it('should return "Today" for today\'s date', () => {
            const today = new Date()
            expect(formatRelativeDate(today)).toBe('Today')
        })

        it('should return "1 day ago" for yesterday', () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            expect(formatRelativeDate(yesterday)).toBe('1 day ago')
        })

        it('should return "X days ago" for dates within a week', () => {
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            expect(formatRelativeDate(threeDaysAgo)).toBe('3 days ago')
        })

        it('should return "1 week ago" for dates 7-13 days ago', () => {
            const oneWeekAgo = new Date()
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
            expect(formatRelativeDate(oneWeekAgo)).toBe('1 week ago')
        })

        it('should return "X weeks ago" for dates within a month', () => {
            const twoWeeksAgo = new Date()
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
            expect(formatRelativeDate(twoWeeksAgo)).toBe('2 weeks ago')
        })

        it('should return "1 month ago" for dates 30-59 days ago', () => {
            const oneMonthAgo = new Date()
            oneMonthAgo.setDate(oneMonthAgo.getDate() - 30)
            expect(formatRelativeDate(oneMonthAgo)).toBe('1 month ago')
        })

        it('should return "X months ago" for dates 60+ days ago', () => {
            const twoMonthsAgo = new Date()
            twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60)
            expect(formatRelativeDate(twoMonthsAgo)).toBe('2 months ago')
        })
    })
})
