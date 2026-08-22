import path from 'node:path'

import { ensurePrivateDirectory } from './credentials.js'

/**
 * Persist the last AI suggestion to `.geeto/last-ai-suggestion.json` for debugging.
 */
export const saveAISuggestion = async (
  provider: string,
  model: string,
  raw: string,
  cleaned?: string
): Promise<void> => {
  try {
    const fs = await import('node:fs/promises')
    const outDir = path.join(process.cwd(), '.geeto')
    ensurePrivateDirectory(outDir)
    const payload = {
      provider,
      model,
      raw,
      cleaned: cleaned ?? raw,
      timestamp: new Date().toISOString(),
    }
    await fs.writeFile(
      path.join(outDir, 'last-ai-suggestion.json'),
      JSON.stringify(payload, null, 2)
    )
  } catch {
    /* ignore file write failures */
  }
}
