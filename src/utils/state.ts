/**
 * State management for checkpoint recovery
 */

import fs from 'node:fs'
import type { GeetoState } from '../types/index.js'

import { ensureGeetoIgnored } from './config.js'
import { ensurePrivateDirectory } from './credentials.js'
import { STEP } from '../core/constants.js'

const STATE_FILE = '.geeto/geeto-state.json'
const AI_PROVIDERS = new Set(['gemini', 'openrouter', 'groq', 'codex', 'opencode-zen', 'manual'])

const normalizeState = (state: GeetoState): GeetoState => {
  const rawProvider = state.aiProvider?.toLowerCase()
  const normalizedProvider = rawProvider === 'opencode' ? 'opencode-zen' : rawProvider
  const modelProviders = [
    state.openrouterModel ? 'openrouter' : undefined,
    state.geminiModel ? 'gemini' : undefined,
    state.groqModel ? 'groq' : undefined,
    state.codexModel ? 'codex' : undefined,
    state.opencodeModel ? 'opencode-zen' : undefined,
  ].filter((provider): provider is string => provider !== undefined)
  const aiProvider = AI_PROVIDERS.has(normalizedProvider ?? '')
    ? normalizedProvider
    : modelProviders.length === 1
      ? modelProviders[0]
      : undefined
  return {
    ...state,
    aiProvider: AI_PROVIDERS.has(aiProvider ?? '')
      ? (aiProvider as GeetoState['aiProvider'])
      : undefined,
  }
}

/**
 * Save state to checkpoint file
 */
export const saveState = (state: GeetoState): void => {
  // Ensure .geeto is in .gitignore
  ensureGeetoIgnored()

  // Ensure .geeto directory exists
  const stateDir = STATE_FILE.slice(0, STATE_FILE.lastIndexOf('/'))
  ensurePrivateDirectory(stateDir)

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * Load state from checkpoint file
 */
export const loadState = (): GeetoState | null => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as GeetoState)
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Reset checkpoint but preserve configured AI provider and models.
 * Useful for "Start fresh" while keeping AI settings.
 */
export const preserveProviderState = (state: GeetoState): void => {
  try {
    const minimal: GeetoState = {
      step: STEP.INIT,
      workingBranch: '',
      targetBranch: '',
      currentBranch: state.currentBranch ?? '',
      timestamp: new Date().toISOString(),
      aiProvider: state.aiProvider,
      openrouterModel: state.openrouterModel,
      geminiModel: state.geminiModel,
      groqModel: state.groqModel,
      codexModel: state.codexModel,
      opencodeModel: state.opencodeModel,
    }

    // Reuse save logic to ensure .geeto exists and is ignored
    saveState(minimal)
  } catch {
    // Ignore errors
  }
}
