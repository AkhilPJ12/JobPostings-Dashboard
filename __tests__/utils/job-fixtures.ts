import type { Job } from '@/lib/job-types'

export function createJob(overrides: Partial<Job> = {}): Job {
    return {
        id: '1',
        externalJobId: 'mock_1',
        title: 'Software Engineer',
        company: 'Vercel',
        companyColor: 'hsl(0, 0%, 10%)',
        companyIcon: null,
        location: 'Remote',
        locationType: 'Remote',
        department: 'Engineering',
        type: 'Full-time',
        postedDate: '2026-03-12',
        endDate: null,
        description: 'Build product features for customers.',
        securityClearance: 'No',
        visaSponsorship: 'Yes',
        jobUrl: 'https://example.com/jobs/mock',
        summary: 'Build product features for customers.',
        requiredQualifications: ['TypeScript experience'],
        preferredQualifications: ['Next.js experience'],
        payRange: '$100,000 - $150,000',
        ...overrides,
    }
}

export const dashboardJobs: Job[] = Array.from({ length: 25 }, (_, i) => {
    const isEngineering = i < 12
    const company = ['Vercel', 'Stripe', 'Figma', 'Linear'][i % 4]

    return createJob({
        id: String(i + 1),
        externalJobId: `mock_${i + 1}`,
        title: isEngineering ? `Software Engineer ${i + 1}` : `Product Manager ${i + 1}`,
        company,
        location: i % 3 === 0 ? 'Remote' : i % 3 === 1 ? 'San Francisco, CA' : 'Austin, TX',
        locationType: i % 3 === 0 ? 'Remote' : i % 3 === 1 ? 'Onsite' : 'Hybrid',
        department: isEngineering ? 'Engineering' : 'Product Management',
        type: i % 5 === 0 ? 'Contract' : 'Full-time',
        securityClearance: i % 7 === 0 ? 'Yes' : 'No',
        visaSponsorship: i % 4 === 0 ? 'No' : 'Yes',
        payRange: i % 3 === 0 ? '$120,000 - $180,000' : 'Not specified',
        postedDate: `2026-03-${String(12 - (i % 10)).padStart(2, '0')}`,
        description: isEngineering
            ? 'Build reliable software systems.'
            : 'Shape roadmap and customer outcomes.',
        summary: isEngineering
            ? 'Build reliable software systems.'
            : 'Shape roadmap and customer outcomes.',
    })
})

export function uniqueCompanyCount(jobs: Job[] = dashboardJobs): number {
    return new Set(jobs.map(job => job.company)).size
}
