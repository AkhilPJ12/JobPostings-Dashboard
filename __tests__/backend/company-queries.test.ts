import {
    getUniqueCompanies,
    getUniqueDepartments,
    getUniqueCompanyCount,
    getJobCountByCompany,
    getJobs,
} from '@/lib/job-data'

describe('Company Queries', () => {
    describe('getUniqueCompanies', () => {
        it('should return an array of company names', async () => {
            const companies = await getUniqueCompanies()
            expect(Array.isArray(companies)).toBe(true)
            expect(companies.length).toBeGreaterThan(0)
        })

        it('should return only strings', async () => {
            const companies = await getUniqueCompanies()
            for (const company of companies) {
                expect(typeof company).toBe('string')
                expect(company.trim().length).toBeGreaterThan(0)
            }
        })

        it('should return companies sorted alphabetically', async () => {
            const companies = await getUniqueCompanies()
            const sorted = [...companies].sort()
            expect(companies).toEqual(sorted)
        })

        it('should return unique company names (no duplicates)', async () => {
            const companies = await getUniqueCompanies()
            const unique = new Set(companies)
            expect(unique.size).toBe(companies.length)
        })
    })

    describe('getUniqueDepartments', () => {
        it('should return an array of departments', async () => {
            const departments = await getUniqueDepartments()
            expect(Array.isArray(departments)).toBe(true)
            expect(departments.length).toBeGreaterThan(0)
        })

        it('should return unique department names', async () => {
            const departments = await getUniqueDepartments()
            const unique = new Set(departments)
            expect(unique.size).toBe(departments.length)
        })

        it('should return departments sorted alphabetically', async () => {
            const departments = await getUniqueDepartments()
            const sorted = [...departments].sort()
            expect(departments).toEqual(sorted)
        })

        it('should not contain null or empty departments', async () => {
            const departments = await getUniqueDepartments()
            for (const dept of departments) {
                expect(dept).not.toBeNull()
                expect(typeof dept).toBe('string')
                expect(dept.trim().length).toBeGreaterThan(0)
            }
        })
    })

    describe('getUniqueCompanyCount', () => {
        it('should return a positive number', async () => {
            const count = await getUniqueCompanyCount()
            expect(typeof count).toBe('number')
            expect(count).toBeGreaterThan(0)
        })

        it('should match the number of unique companies', async () => {
            const count = await getUniqueCompanyCount()
            const companies = await getUniqueCompanies()
            expect(count).toBe(companies.length)
        })
    })

    describe('getJobCountByCompany', () => {
        it('should return a count for a known company', async () => {
            const companies = await getUniqueCompanies()
            expect(companies.length).toBeGreaterThan(0)

            const count = await getJobCountByCompany(companies[0])
            expect(typeof count).toBe('number')
            expect(count).toBeGreaterThan(0)
        })

        it('should return 0 for a non-existent company', async () => {
            const count = await getJobCountByCompany('Nonexistent Company XYZ')
            expect(count).toBe(0)
        })

        it('should have counts that sum to total active jobs', async () => {
            const companies = await getUniqueCompanies()
            let totalCount = 0
            for (const company of companies) {
                totalCount += await getJobCountByCompany(company)
            }

            const allJobs = await getJobs()
            expect(totalCount).toBe(allJobs.length)
        })
    })
})
