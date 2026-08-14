import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
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
const CODEX_PACKAGE = '@openai/codex@0.144.3'
type CodexTarget = {
  packageName: string
  targetTriple: string
  binaryName: string
}

const getCodexTarget = (): CodexTarget | undefined => {
  const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex'

  if (process.platform === 'linux' || process.platform === 'android') {
    if (process.arch === 'x64') {
      return {
        packageName: '@openai/codex-linux-x64',
        targetTriple: 'x86_64-unknown-linux-musl',
        binaryName,
      }
    }
    if (process.arch === 'arm64') {
      return {
        packageName: '@openai/codex-linux-arm64',
        targetTriple: 'aarch64-unknown-linux-musl',
        binaryName,
      }
    }
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'x64') {
      return {
        packageName: '@openai/codex-darwin-x64',
        targetTriple: 'x86_64-apple-darwin',
        binaryName,
      }
    }
    if (process.arch === 'arm64') {
      return {
        packageName: '@openai/codex-darwin-arm64',
        targetTriple: 'aarch64-apple-darwin',
        binaryName,
      }
    }
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') {
      return {
        packageName: '@openai/codex-win32-x64',
        targetTriple: 'x86_64-pc-windows-msvc',
        binaryName,
      }
    }
    if (process.arch === 'arm64') {
      return {
        packageName: '@openai/codex-win32-arm64',
        targetTriple: 'aarch64-pc-windows-msvc',
        binaryName,
      }
    }
  }

  return undefined
}

const CODEX_TARGET = getCodexTarget()
const CODEX_RUNTIME_ROOT = path.join(os.homedir(), '.geeto', 'codex-runtime')
const CODEX_RUNTIME_HOME = path.join(os.homedir(), '.geeto', 'codex-runtime', 'home')
const CODEX_RUNTIME_AUTH = path.join(CODEX_RUNTIME_HOME, '.codex', 'auth.json')
const CODEX_RUNTIME_BINARY = CODEX_TARGET
  ? path.join(
      CODEX_RUNTIME_ROOT,
      'vendor',
      CODEX_TARGET.targetTriple,
      'bin',
      CODEX_TARGET.binaryName
    )
  : undefined
const runtimeRequire = createRequire(import.meta.url)

const resolveCodexVendor = (runtimeRoot: string): string | undefined => {
  if (!CODEX_TARGET) return undefined

  const directVendor = path.join(
    runtimeRoot,
    'node_modules',
    CODEX_TARGET.packageName,
    'vendor',
    CODEX_TARGET.targetTriple
  )
  const candidates = [directVendor]
  const codexPackageJsonPath = path.join(
    runtimeRoot,
    'node_modules',
    '@openai',
    'codex',
    'package.json'
  )

  if (fs.existsSync(codexPackageJsonPath)) {
    try {
      const packageRequire = createRequire(codexPackageJsonPath)
      const platformPackageJsonPath = packageRequire.resolve(
        `${CODEX_TARGET.packageName}/package.json`
      )
      candidates.unshift(
        path.join(path.dirname(platformPackageJsonPath), 'vendor', CODEX_TARGET.targetTriple)
      )
    } catch {
      // Try the direct package path below.
    }
  }

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'codex-package.json')))
}

const getCodexBinaryCandidates = (): string[] => {
  if (!CODEX_TARGET) return []

  const candidates = CODEX_RUNTIME_BINARY ? [CODEX_RUNTIME_BINARY] : []
  try {
    const packageJsonPath = runtimeRequire.resolve(`${CODEX_TARGET.packageName}/package.json`)
    candidates.push(
      path.join(
        path.dirname(packageJsonPath),
        'vendor',
        CODEX_TARGET.targetTriple,
        'bin',
        CODEX_TARGET.binaryName
      )
    )
  } catch {
    // The compiled binary has no package tree; use the staged runtime instead.
  }

  candidates.push(
    path.join(
      process.cwd(),
      'node_modules',
      CODEX_TARGET.packageName,
      'vendor',
      CODEX_TARGET.targetTriple,
      'bin',
      CODEX_TARGET.binaryName
    )
  )

  return [...new Set(candidates)]
}

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

export const prepareCodexRuntimeHome = (): void => {
  fs.mkdirSync(path.dirname(CODEX_RUNTIME_AUTH), { recursive: true, mode: 0o700 })

  const globalAuthPath = path.join(os.homedir(), '.codex', 'auth.json')
  if (fs.existsSync(globalAuthPath)) {
    fs.copyFileSync(globalAuthPath, CODEX_RUNTIME_AUTH)
    fs.chmodSync(CODEX_RUNTIME_AUTH, 0o600)
  } else if (!fs.existsSync(CODEX_RUNTIME_AUTH)) {
    fs.rmSync(CODEX_RUNTIME_AUTH, { force: true })
  }
}

export const getCodexEnvironment = (binaryPath?: string): Record<string, string> => {
  const environment: Record<string, string> = { HOME: CODEX_RUNTIME_HOME }
  for (const key of ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'NO_COLOR']) {
    const value = process.env[key]
    if (value) environment[key] = value
  }

  const pathDir = binaryPath ? path.join(path.dirname(binaryPath), '..', 'codex-path') : undefined
  if (pathDir && fs.existsSync(pathDir)) {
    environment.PATH = [pathDir, environment.PATH].filter(Boolean).join(path.delimiter)
  }

  return environment
}

const getAvailableCodexBinary = (): string | undefined => {
  for (const candidate of getCodexBinaryCandidates()) {
    try {
      execFileSync(candidate, ['--version'], {
        stdio: 'pipe',
        env: getCodexEnvironment(candidate),
      })
      return candidate
    } catch {
      // Try the next staged or package-managed candidate.
    }
  }

  return undefined
}

export const getCodexBinaryPath = (): string | undefined => getAvailableCodexBinary()

export const installCodexRuntime = (): boolean => {
  if (isAvailable()) return true
  if (!CODEX_TARGET) {
    log.warn(`Codex runtime is unsupported on ${process.platform}/${process.arch}.`)
    return false
  }

  const installer = ['npm', 'bun'].find((command) => {
    try {
      execFileSync(command, ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })

  if (!installer) {
    log.warn('Codex setup needs npm or Bun available in PATH.')
    return false
  }

  try {
    fs.mkdirSync(CODEX_RUNTIME_ROOT, { recursive: true })
    if (installer === 'npm') {
      execFileSync(
        installer,
        [
          'install',
          '--prefix',
          CODEX_RUNTIME_ROOT,
          '--no-save',
          '--package-lock=false',
          CODEX_PACKAGE,
        ],
        { stdio: 'inherit' }
      )
    } else {
      execFileSync(installer, ['add', '--cwd', CODEX_RUNTIME_ROOT, '--exact', CODEX_PACKAGE], {
        stdio: 'inherit',
      })
    }

    const sourceVendor = resolveCodexVendor(CODEX_RUNTIME_ROOT)
    const targetVendor = path.join(CODEX_RUNTIME_ROOT, 'vendor', CODEX_TARGET.targetTriple)
    if (!sourceVendor) {
      log.warn('Codex package installed without a usable native runtime.')
      return false
    }

    fs.cpSync(sourceVendor, targetVendor, { recursive: true, force: true })
    return isAvailable()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn(`Codex runtime setup failed: ${message}`)
    return false
  }
}

const ensureClient = (): boolean => {
  if (codexInstance) return true
  try {
    const codexPath = getAvailableCodexBinary()
    if (!codexPath) return false

    prepareCodexRuntimeHome()
    const apiKey = readStoredApiKey()
    const options = { env: getCodexEnvironment(codexPath), codexPathOverride: codexPath }
    codexInstance = apiKey ? new Codex({ ...options, apiKey }) : new Codex(options)
    return true
  } catch {
    codexInstance = null
    return false
  }
}

export const isAvailable = (): boolean => getAvailableCodexBinary() !== undefined

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
    log.warn('OpenAI Codex error: ' + String(error))
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
    log.warn('OpenAI Codex error: ' + String(error))
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
    log.warn('OpenAI Codex error: ' + String(error))
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
