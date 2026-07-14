import { resolveConfigPath } from '../utils/config.js'

export {
  generateBranchName,
  generateCommitMessage,
  generateReleaseNotes,
  generateText,
  getCodexModels as getCodexModelsLive,
  isAvailable,
} from './codex-sdk.js'

const FALLBACK_MODELS: Array<{ label: string; value: string }> = [
  { label: 'Codex Agent (default)', value: 'codex-agent' },
]

/**
 * Return Codex model choices — persisted file first, fallback to live API.
 */
export const getCodexModels = async (): Promise<Array<{ label: string; value: string }>> => {
  try {
    const fs = await import('node:fs')
    const modelFile = resolveConfigPath('codex-model.json')
    if (fs.existsSync(modelFile)) {
      const data = JSON.parse(fs.readFileSync(modelFile, 'utf8')) as Array<{
        label: string
        value: string
      }>
      if (Array.isArray(data) && data.length > 0) {
        return data
      }
    }
  } catch {
    /* fall through to live */
  }

  // Live API fallback
  try {
    const { getCodexModels: getLive } = await import('./codex-sdk.js')
    return await getLive()
  } catch {
    /* fall through to hardcoded */
  }

  return FALLBACK_MODELS
}
