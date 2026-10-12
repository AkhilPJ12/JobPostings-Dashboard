import { createRawJobPayload, createSourceContentHash, prepareJobForAiUpsert, type AiUpsertJob } from '@/lib/modules/ingestion/source-payload'
import { OllamaCloudProvider, validateEvidence, type OllamaExtraction } from '@/lib/modules/enrichment/ollama'

const source: AiUpsertJob = {
  company_id: 1, external_job_id: 'acme_123', title: 'Engineer', location: 'Austin, TX',
  location_type: 'Hybrid', department: 'Engineering', employment_type: 'Full-time',
  posted_date: new Date().toISOString().slice(0,10), end_date: null,
  description: 'Hybrid role. Salary $120,000 - $150,000. No visa sponsorship. Must hold active TS/SCI clearance. TypeScript required.',
  summary: 'Build software.', required_qualifications: ['TypeScript required'], preferred_qualifications: [],
  pay_range: '$120,000 - $150,000', security_clearance: 'Yes', h1b_sponsorship: 'No',
  job_url: 'https://example.com/job/123', is_active: true,
}

const extraction: OllamaExtraction = {
  summary: 'Build software in a hybrid role.', summaryEvidence: ['Hybrid role.'],
  requiredQualifications: [{ value: 'TypeScript', evidence: 'TypeScript required.' }], preferredQualifications: [],
  department: { value: 'Engineering', evidence: 'missing department excerpt' },
  payRange: { value: '$200,000 - $300,000', evidence: 'Salary $120,000 - $150,000.' },
  locationType: { value: 'Remote', evidence: 'Hybrid role.' },
  employmentType: { value: 'Full-time', evidence: null },
  h1bSponsorship: { value: 'Yes', evidence: 'No visa sponsorship.' },
  securityClearance: { value: 'Yes', evidence: 'Must hold active TS/SCI clearance.' },
}

describe('source preservation and Ollama validation', () => {
  it('hashes source deterministically and never replaces source fields with prior AI output', () => {
    const hash = prepareJobForAiUpsert(source).source_content_hash
    expect(createSourceContentHash(createRawJobPayload({ ...source }))).toBe(hash)
    expect(createSourceContentHash(createRawJobPayload({ ...source, description: 'changed' }))).not.toBe(hash)
    const prepared = prepareJobForAiUpsert(source, {
      external_job_id: source.external_job_id, posted_date: source.posted_date,
      source_content_hash: hash || null, ai_enrichment_status: 'enriched', ai_enrichment_model: 'old',
      ai_enriched_at: '2026-01-01', ai_enrichment_error: null, ai_enrichment_attempts: 1,
      title: 'Fabricated title', h1b_sponsorship: 'Yes',
    })
    expect(prepared.title).toBe(source.title)
    expect(prepared.h1b_sponsorship).toBeNull()
    expect(prepared.department).toBeNull()
    expect(prepared.ai_enrichment_status).toBe('enriched')
  })

  it('does not reactivate a job older than fourteen days', () => {
    const stale = prepareJobForAiUpsert({ ...source, posted_date: '2020-01-01' }, undefined, { preservePostedDate: true })
    expect(stale.is_active).toBe(false)
    expect(stale.date_provenance).toBe('first_seen')
  })

  it('stores missing factual values as null in the normalized source snapshot', () => {
    const prepared = prepareJobForAiUpsert({ ...source, pay_range: 'Not specified',
      h1b_sponsorship: 'N/A', security_clearance: 'N/A', summary: '' })
    expect(prepared.pay_range).toBeNull()
    expect(prepared.h1b_sponsorship).toBeNull()
    expect(prepared.security_clearance).toBeNull()
    expect(prepared.summary).toBeNull()
    expect((prepared.raw_job_payload as Record<string, unknown>).pay_range).toBeUndefined()
    expect((prepared.raw_job_payload as Record<string, unknown>).structured_source_fields).toEqual({})
  })

  it('rejects unsupported critical claims while retaining evidenced qualifications', () => {
    const result = validateEvidence(extraction, createRawJobPayload(source) as Record<string, unknown>)
    expect(result.requiredQualifications).toEqual(['TypeScript'])
    expect(result.locationType).toBeUndefined()
    expect(result.h1bSponsorship).toBeUndefined()
    expect(result.securityClearance).toBe('Yes')
    expect(result.payRange).toBeUndefined()
    expect(result.department).toBeUndefined()
  })

  it('lets the model map a quoted role to a department and preserves structured source facts', () => {
    const prepared = prepareJobForAiUpsert({ ...source,
      structuredSourceFields: { pay_range: '$120,000 - $150,000', h1b_sponsorship: 'No' },
    })
    expect(prepared.pay_range).toBe('$120,000 - $150,000')
    expect(prepared.h1b_sponsorship).toBe('No')
    expect(prepared.source_field_provenance).toEqual({ pay_range: 'structured', h1b_sponsorship: 'structured' })
    const mapped = validateEvidence({ ...extraction,
      department: { value: 'Engineering', evidence: 'Engineer' },
      locationType: { value: 'Hybrid', evidence: 'Hybrid role.' },
    }, prepared.raw_job_payload as Record<string, unknown>)
    expect(mapped.department).toBe('Engineering')
    expect(mapped.locationType).toBe('Hybrid')
  })

  it('keeps critical fields unknown when quoted evidence does not state them', () => {
    const unknownSource = createRawJobPayload({ ...source, description: 'Build services in Austin.',
      pay_range: 'Not specified', h1b_sponsorship: 'N/A', security_clearance: 'N/A' }) as Record<string, unknown>
    const unsupported: OllamaExtraction = { ...extraction,
      payRange: { value: '$200,000', evidence: 'Build services in Austin.' },
      h1bSponsorship: { value: 'Yes', evidence: 'Build services in Austin.' },
      securityClearance: { value: 'No', evidence: 'Build services in Austin.' },
      requiredQualifications: [], summary: null, summaryEvidence: [],
    }
    const result = validateEvidence(unsupported, unknownSource)
    expect(result.payRange).toBeUndefined()
    expect(result.h1bSponsorship).toBeUndefined()
    expect(result.securityClearance).toBeUndefined()
  })

  it('does not invert explicit negatives into positive sponsorship or clearance', () => {
    const negativeSource = createRawJobPayload({ ...source,
      description: 'We will not sponsor visas. No security clearance is required.',
      h1b_sponsorship: 'N/A', security_clearance: 'N/A',
    }) as Record<string, unknown>
    const negativeExtraction: OllamaExtraction = { ...extraction,
      h1bSponsorship: { value: 'Yes', evidence: 'We will not sponsor visas.' },
      securityClearance: { value: 'Yes', evidence: 'No security clearance is required.' },
    }
    const result = validateEvidence(negativeExtraction, negativeSource)
    expect(result.h1bSponsorship).toBeUndefined()
    expect(result.securityClearance).toBeUndefined()
  })

  it('calls Ollama Cloud with a server key and repairs invalid JSON once', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: 'broken' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: JSON.stringify(extraction) } }) })
    const before = jest.fn().mockResolvedValue(true)
    const provider = new OllamaCloudProvider('gemma4:31b', 'test-key', fetchMock as unknown as typeof fetch)
    const response = await provider.enrich(createRawJobPayload(source) as Record<string, unknown>, before)
    expect(response.requests).toBe(2)
    expect(before).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://ollama.com/api/chat')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key')
  })
})
