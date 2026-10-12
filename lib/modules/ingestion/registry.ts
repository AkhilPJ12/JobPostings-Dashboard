import type { SourceKind } from './contracts'

export interface RegisteredSource {
  name: string
  script: string
  kind: SourceKind
  args?: string[]
}

export const SOURCES: RegisteredSource[] = [
  { name: 'Amazon', script: 'scrape-amazon-jobs.ts', kind: 'api' },
  { name: 'IBM', script: 'scrape-ibm-jobs.ts', kind: 'api' },
  { name: 'Visa', script: 'scrape-visa-jobs.ts', kind: 'api' },
  { name: 'JPMorgan Chase', script: 'scrape-jpmorgan-jobs.ts', kind: 'api' },
  { name: 'Datavant', script: 'scrape-datavant-jobs.ts', kind: 'api' },
  { name: 'Anthropic', script: 'scrape-anthropic-jobs.ts', kind: 'api' },
  { name: 'OpenAI', script: 'scrape-openai-jobs.ts', kind: 'api' },
  { name: 'Microsoft', script: 'scrape-pcsx-jobs.ts', args: ['microsoft'], kind: 'browser' },
  { name: 'Nvidia', script: 'scrape-pcsx-jobs.ts', args: ['nvidia'], kind: 'browser' },
  { name: 'Google', script: 'scrape-google-jobs.ts', kind: 'browser' },
  { name: 'Meta', script: 'scrape-meta-jobs.ts', kind: 'browser' },
  { name: 'Apple', script: 'scrape-apple-jobs.ts', kind: 'browser' },
  { name: 'Salesforce', script: 'scrape-salesforce-jobs.ts', kind: 'browser' },
  { name: 'Accenture', script: 'scrape-accenture-jobs.ts', kind: 'browser' },
  { name: 'Deloitte', script: 'scrape-deloitte-jobs.ts', kind: 'browser' },
  { name: 'CVS', script: 'scrape-workday-jobs.ts', args: ['CVS'], kind: 'browser' },
  { name: 'AT&T', script: 'scrape-workday-jobs.ts', args: ['AT&T'], kind: 'browser' },
  { name: 'Walmart', script: 'scrape-workday-jobs.ts', args: ['Walmart'], kind: 'browser' },
  { name: 'CarMax', script: 'scrape-workday-jobs.ts', args: ['CarMax'], kind: 'browser' },
  { name: 'Texas Instruments', script: 'scrape-ti-jobs.ts', kind: 'browser' },
  { name: 'Staples', script: 'scrape-staples-jobs.ts', kind: 'browser' },
  { name: 'Intuit', script: 'scrape-intuit-jobs.ts', kind: 'browser' },
  { name: 'Wellsfargo', script: 'scrape-wellsfargo-jobs.ts', kind: 'browser' },
  { name: 'Infosys', script: 'scrape-infosys-jobs.ts', kind: 'browser' },
  { name: 'Goldman Sachs', script: 'scrape-goldmansachs-jobs.ts', kind: 'browser' },
  { name: 'Wipro', script: 'scrape-wipro-jobs.ts', kind: 'browser' },
]

export function partitionSources(kind: SourceKind, batch: number, batches = 4): RegisteredSource[] {
  if (!Number.isInteger(batch) || batch < 0 || batch >= batches) throw new Error('Invalid source batch')
  return SOURCES.filter(source => source.kind === kind)
    .filter((_, index) => index % batches === batch)
}
