import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { z } from 'zod'

const execFileAsync = promisify(execFile)
let browserQueue = Promise.resolve()
const BridgeResult = z.union([
  z.object({ status: z.number().int().min(100).max(599), contentType: z.string(), bodyBase64: z.string() }),
  z.object({ error: z.string() }),
])

/** Free, local fallback. Python and Scrapling are installed only in scraper workers. */
export async function fetchWithScrapling(url: string | URL, mode: 'http' | 'browser'): Promise<Response> {
  let releaseBrowser: () => void = () => undefined
  if (mode === 'browser') {
    const previous = browserQueue
    browserQueue = new Promise<void>(resolve => { releaseBrowser = resolve })
    await previous
  }
  try {
    const python = process.env.SCRAPLING_PYTHON || 'python3'
    const script = resolve(process.cwd(), 'scripts/scrapling_fetch.py')
    const { stdout } = await execFileAsync(python, [script, mode, String(url)], {
      timeout: mode === 'browser' ? 60000 : 35000,
      maxBuffer: 8_000_000,
      killSignal: 'SIGKILL',
    })
    const result = BridgeResult.parse(JSON.parse(stdout))
    if ('error' in result) throw new Error(`Scrapling ${mode} fetch failed: ${result.error}`)
    return new Response([204, 205, 304].includes(result.status) ? null : Buffer.from(result.bodyBase64, 'base64'), {
      status: result.status,
      headers: { 'content-type': result.contentType },
    })
  } finally { releaseBrowser() }
}
