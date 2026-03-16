import { getJobs, getJobById, type Job } from '@/lib/job-data'

describe('Job Queries', () => {
    let jobs: Job[]

    beforeAll(async () => {
        jobs = await getJobs()
    })

    describe('getJobs', () => {
        it('should return an array of jobs', () => {
            expect(Array.isArray(jobs)).toBe(true)
            expect(jobs.length).toBeGreaterThan(0)
        })

        it('should return jobs with all required fields', () => {
            const job = jobs[0]
            expect(job).toHaveProperty('id')
            expect(job).toHaveProperty('title')
            expect(job).toHaveProperty('company')
            expect(job).toHaveProperty('companyColor')
            expect(job).toHaveProperty('location')
            expect(job).toHaveProperty('locationType')
            expect(job).toHaveProperty('department')
            expect(job).toHaveProperty('type')
            expect(job).toHaveProperty('postedDate')
            expect(job).toHaveProperty('description')
            expect(job).toHaveProperty('securityClearance')
            expect(job).toHaveProperty('visaSponsorship')
            expect(job).toHaveProperty('summary')
            expect(job).toHaveProperty('requiredQualifications')
            expect(job).toHaveProperty('preferredQualifications')
            expect(job).toHaveProperty('payRange')
        })

        it('should return jobs with correct field types', () => {
            for (const job of jobs) {
                expect(typeof job.id).toBe('string')
                expect(typeof job.title).toBe('string')
                expect(typeof job.company).toBe('string')
                expect(typeof job.location).toBe('string')
                expect(typeof job.department).toBe('string')
                expect(typeof job.postedDate === 'string' || job.postedDate === null).toBe(true)
                expect(Array.isArray(job.requiredQualifications)).toBe(true)
                expect(Array.isArray(job.preferredQualifications)).toBe(true)
            }
        })

        it('should return jobs with valid enum values for locationType', () => {
            const validTypes = ['Remote', 'Hybrid', 'Onsite']
            for (const job of jobs) {
                expect(validTypes).toContain(job.locationType)
            }
        })

        it('should return jobs with valid enum values for employment type', () => {
            const validTypes = ['Full-time', 'Part-time', 'Contract', 'Internship']
            for (const job of jobs) {
                expect(validTypes).toContain(job.type)
            }
        })

        it('should return jobs with valid enum values for securityClearance', () => {
            const validValues = ['Yes', 'No', 'N/A']
            for (const job of jobs) {
                expect(validValues).toContain(job.securityClearance)
            }
        })

        it('should return jobs with valid enum values for visaSponsorship', () => {
            const validValues = ['Yes', 'No', 'N/A']
            for (const job of jobs) {
                expect(validValues).toContain(job.visaSponsorship)
            }
        })

        it('should return jobs sorted by posted date descending', () => {
            for (let i = 1; i < jobs.length; i++) {
                const prev = jobs[i - 1].postedDate || ''
                const curr = jobs[i].postedDate || ''
                expect(prev >= curr).toBe(true)
            }
        })

        it('should not return jobs with empty titles', () => {
            for (const job of jobs) {
                expect(job.title.trim().length).toBeGreaterThan(0)
            }
        })

        it('should not return jobs with empty company names', () => {
            for (const job of jobs) {
                expect(job.company.trim().length).toBeGreaterThan(0)
            }
        })
    })

    describe('getJobById', () => {
        it('should return the correct job for a valid ID', async () => {
            const firstJob = jobs[0]
            const fetched = await getJobById(firstJob.id)

            expect(fetched).toBeDefined()
            expect(fetched!.id).toBe(firstJob.id)
            expect(fetched!.title).toBe(firstJob.title)
            expect(fetched!.company).toBe(firstJob.company)
        })

        it('should return undefined for a non-existent ID', async () => {
            const result = await getJobById('999999')
            expect(result).toBeUndefined()
        })

        it('should return undefined for an invalid ID format', async () => {
            const result = await getJobById('not-a-number')
            expect(result).toBeUndefined()
        })

        it('should return a job with all required fields', async () => {
            const firstJob = jobs[0]
            const fetched = await getJobById(firstJob.id)

            expect(fetched).toBeDefined()
            expect(typeof fetched!.title).toBe('string')
            expect(typeof fetched!.company).toBe('string')
            expect(typeof fetched!.postedDate === 'string' || fetched!.postedDate === null).toBe(true)
            expect(Array.isArray(fetched!.requiredQualifications)).toBe(true)
        })
    })
})
