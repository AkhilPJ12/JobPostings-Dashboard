import {
    getUniqueCompanies,
    getUniqueDepartments,
    getJobById,
    formatDate,
} from '@/lib/job-data'

describe('job-data utilities', () => {
    describe('formatDate', () => {
        it('should return "N/A" for null', () => {
            expect(formatDate(null)).toBe('N/A')
        })

        it('should return "N/A" for empty string', () => {
            expect(formatDate('')).toBe('N/A')
        })

        it('should return "N/A" for invalid date', () => {
            expect(formatDate('not-a-date')).toBe('N/A')
        })

        it('should format a valid date string', () => {
            const result = formatDate('2026-03-12')
            expect(result).toBe('Mar 12, 2026')
        })

        it('should format another valid date', () => {
            const result = formatDate('2026-01-05')
            expect(result).toBe('Jan 5, 2026')
        })
    })
})
