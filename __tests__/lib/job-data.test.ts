import {
    getUniqueCompanies,
    getUniqueDepartments,
    getJobById,
    formatRelativeDate,
} from '@/lib/job-data'

describe('job-data utilities', () => {
    describe('formatRelativeDate', () => {
        it('should return "Today" for current date', () => {
            const today = new Date()
            expect(formatRelativeDate(today)).toBe('Today')
        })

        it('should return "Yesterday" for 1 day ago', () => {
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            expect(formatRelativeDate(yesterday)).toBe('Yesterday')
        })

        it('should return "X days ago" for 2-6 days ago', () => {
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            expect(formatRelativeDate(threeDaysAgo)).toBe('3 days ago')
        })

        it('should return weeks for 7-29 days ago', () => {
            const twoWeeksAgo = new Date()
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
            expect(formatRelativeDate(twoWeeksAgo)).toBe('2 weeks ago')
        })

        it('should return months for 30+ days ago', () => {
            const twoMonthsAgo = new Date()
            twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60)
            expect(formatRelativeDate(twoMonthsAgo)).toBe('2 months ago')
        })
    })
})
