export type SourceKind = 'api' | 'browser'

export interface ScrapeResult {
  company: string
  fetched: number | null
  eligible: number
  written: number
  rejected: number | null
  complete: boolean
  errors: string[]
}

export interface SourceAdapter {
  name: string
  kind: SourceKind
  run(signal: AbortSignal): Promise<ScrapeResult>
}

export function classifyScrapeResult(result: ScrapeResult): 'Successful' | 'Partial' | 'Error' {
  if (!result.complete || result.written < result.eligible || result.errors.length > 0) return 'Partial'
  return 'Successful'
}
