import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Codex } from '@openai/codex-sdk'

import {
  buildCommitPrompt,
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { log } from '../utils/logging.js'

let codexInstance: Codex | null = null

/**
 * Read the API key stored by geeto's token-based setup.
 * Returns null when using OAuth auth (no key stored).
 */
const readStoredApiKey = (): string | null => {
  try {
    const configPath = path.join(os.homedir(), '.geeto', 'codex.toml')
    if (!fs.existsSync(configPath)) return null
    const content = fs.readFileSync(configPath, 'utf8')
    const match = content.match(/api_key\s*=\s*["']([^"']+)["']/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

const ensureClient = (): boolean => {
  if (codexInstance) return true
  try {
    const apiKey = readStoredApiKey()
    // Pass apiKey only when using token auth; OAuth mode passes nothing so
    // the Codex CLI uses its own ~/.codex/auth.json token instead.
    codexInstance = apiKey ? new Codex({ apiKey }) : new Codex()
    return true
  } catch {
    codexInstance = null
    return false
  }
}

export const isAvailable = (): boolean => ensureClient()

export const generateBranchName = async (
  text: string,
  correction?: string,
  _model?: string
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction)
  try {
    const thread = (codexInstance as Codex).startThread()
    const result = await thread.run(prompt)
    const content = result.finalResponse
    if (!content) return null
    const first =
      content
        .trim()
        .split('\n')
        .find((l) => !!l) ?? ''
    return normalizeBranchName(first) || null
  } catch (error) {
    log.clearLine()
    log.warn('Codex Error: ' + String(error))
    return null
  }
}

export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  _model?: string
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildCommitPrompt(diff, correction)
  try {
    const thread = (codexInstance as Codex).startThread()
    const result = await thread.run(prompt)
    const content = result.finalResponse
    if (!content) return null
    return cleanAIContent(content, { normalizeBlankLines: true, minLength: MIN_AI_RESPONSE_LENGTH })
  } catch (error) {
    log.clearLine()
    log.warn('Codex Error: ' + String(error))
    return null
  }
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  _model?: string
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildReleaseNotesPrompt(commits, language, correction)
  try {
    const thread = (codexInstance as Codex).startThread()
    const result = await thread.run(prompt)
    const content = result.finalResponse
    if (!content) return null
    return cleanAIContent(content)
  } catch (error) {
    log.clearLine()
    log.warn('Codex Error: ' + String(error))
    return null
  }
}

export const generateText = async (prompt: string, _model?: string): Promise<string | null> => {
  if (!ensureClient()) return null
  try {
    const thread = (codexInstance as Codex).startThread()
    const result = await thread.run(prompt)
    const content = result.finalResponse
    if (!content) return null
    return cleanAIContent(content)
  } catch {
    return null
  }
}

// Static catalog sourced from https://developers.openai.com/codex/models.md
// and cross-referenced with clopen's adapter (github.com/myrialabs/clopen).
// Pruned to IDs the Codex CLI accepts via --model flag.
// Update when OpenAI ships a new generation.
const STATIC_CODEX_MODELS: Array<{ label: string; value: string }> = [
  // GPT-5 series (current — available to API key + ChatGPT OAuth)
  { label: 'gpt-5.4 (flagship)', value: 'gpt-5.4' },
  { label: 'gpt-5.4-mini (fast)', value: 'gpt-5.4-mini' },
  { label: 'gpt-5.3-codex (code-optimized)', value: 'gpt-5.3-codex' },
  { label: 'gpt-5.2 (balanced)', value: 'gpt-5.2' },
  // ChatGPT OAuth only
  { label: 'gpt-5.5 (ChatGPT only)', value: 'gpt-5.5' },
  { label: 'gpt-5.3-codex-spark (ChatGPT Pro)', value: 'gpt-5.3-codex-spark' },
  // Legacy o-series (API key)
  { label: 'o4-mini (fast reasoning)', value: 'o4-mini' },
  { label: 'o4-mini-high (high reasoning effort)', value: 'o4-mini-high' },
  { label: 'o3 (advanced reasoning)', value: 'o3' },
  { label: 'o3-mini (compact reasoning)', value: 'o3-mini' },
]

// Models we want to surface — others from the API are filtered out (embeddings, TTS, etc.)
const CODEX_COMPATIBLE_PREFIXES = ['o1', 'o3', 'o4', 'gpt-4', 'gpt-4o', 'codex', 'gpt-5']

/**
 * Fetch available models from OpenAI Models API.
 * Only works when using token auth (API key stored in ~/.geeto/codex.toml).
 * Falls back to the static list when using OAuth or when the request fails.
 */
export const getCodexModels = async (): Promise<Array<{ label: string; value: string }>> => {
  const apiKey = readStoredApiKey()

  if (!apiKey) {
    // OAuth mode — no key to call the API with; use static list.
    return STATIC_CODEX_MODELS
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      log.warn(`OpenAI Models API returned ${res.status}; using static model list.`)
      return STATIC_CODEX_MODELS
    }

    const json = (await res.json()) as { data?: Array<{ id: string }> }
    const allModels = json.data ?? []

    // Filter to chat/reasoning models compatible with Codex CLI
    const filtered = allModels
      .map((m) => m.id)
      .filter((id) => CODEX_COMPATIBLE_PREFIXES.some((prefix) => id.startsWith(prefix)))
      // Exclude fine-tuned, preview-flagged legacy, or audio/vision-only models
      .filter(
        (id) =>
          !id.includes('instruct') &&
          !id.includes('realtime') &&
          !id.includes('audio') &&
          !id.includes('search') &&
          !id.includes('embedding')
      )
      // eslint-disable-next-line unicorn/no-array-sort
      .sort()

    if (filtered.length === 0) return STATIC_CODEX_MODELS

    return filtered.map((id) => ({ label: id, value: id }))
  } catch {
    // Network error or parse failure — fall back gracefully.
    return STATIC_CODEX_MODELS
  }
}
