import {
    getUniqueCompanies,
    getUniqueDepartments,
    getJobById,
    formatRelativeDate,
} from '@/lib/job-data'

describe('job-data utilities', () => {
    describe('getUniqueCompanies', () => {
        it('should return unique company names', () => {
            const companies = getUniqueCompanies()
            expect(companies.length).toBeGreaterThan(0)
            expect(new Set(companies).size).toBe(companies.length)
        })
    })

    describe('getUniqueDepartments', () => {
        it('should return unique departments', () => {
            const departments = getUniqueDepartments()
            expect(departments.length).toBeGreaterThan(0)
            expect(new Set(departments).size).toBe(departments.length)
        })
    })

    describe('getJobById', () => {
        it('should return the correct job when given a valid id', () => {
            const job = getJobById('1')
            expect(job).toBeDefined()
            expect(job?.id).toBe('1')
        })

        it('should return undefined for invalid id', () => {
            const job = getJobById('invalid-id')
            expect(job).toBeUndefined()
        })
    })

    describe('formatRelativeDate', () => {
        it('should return "Today" for current date', () => {
            const today = new Date()
            expect(formatRelativeDate(today)).toBe('Today')
        })

        it('should return "X days ago" for recent dates', () => {
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            expect(formatRelativeDate(threeDaysAgo)).toBe('3 days ago')
        })
    })
})
