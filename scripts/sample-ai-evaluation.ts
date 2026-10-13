/** Prepare a balanced, unreviewed sample from current source snapshots. */
import { writeFile } from 'fs/promises'
import { SOURCES } from '../lib/modules/ingestion/registry'
import { getSupabaseAdminClient } from './scraper-utils'

async function main() {
  const output = process.argv[2] || 'ai-evaluation-candidates.json'
  const db = getSupabaseAdminClient()
  const { data: companies, error: companyError } = await db.from('companies')
    .select('id,name').in('name', SOURCES.map(source => source.name))
  if (companyError) throw companyError
  const byCompany: Array<{ company: string; payloads: Record<string, unknown>[] }> = []
  for (const company of companies || []) {
    const { data: jobs, error } = await db.from('jobs').select('raw_job_payload')
      .eq('company_id', company.id).eq('is_active', true)
      .not('raw_job_payload', 'is', null).order('posted_date', { ascending: false }).limit(10)
    if (error) throw error
    const payloads = (jobs || []).map(job => job.raw_job_payload)
      .filter(payload =>
        Boolean(payload && typeof payload === 'object' && !Array.isArray(payload) &&
          typeof payload.description === 'string' && payload.description.length > 200))
      .map(payload => payload as Record<string, unknown>)
    if (payloads.length) byCompany.push({ company: company.name, payloads })
  }
  const selected: Array<{ company: string; source: Record<string, unknown> }> = []
  for (let round = 0; round < 10 && selected.length < 50; round++) {
    for (const entry of byCompany) {
      if (entry.payloads[round]) selected.push({ company: entry.company, source: entry.payloads[round] })
      if (selected.length === 50) break
    }
  }
  if (selected.length < 50) throw new Error(`Only ${selected.length} suitable source snapshots; need 50`)
  const cases = selected.map(({ company, source }) => ({ company, source, reviewed: false,
    expected: { payRange: null, h1bSponsorship: null, securityClearance: null,
      locationType: null, employmentType: null, department: null,
      requiredQualifications: [], preferredQualifications: [] } }))
  await writeFile(output, JSON.stringify(cases, null, 2), { flag: 'wx' })
  console.log(`Wrote ${cases.length} unreviewed postings to ${output}. Set reviewed=true only after checking every expected field against its source.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
