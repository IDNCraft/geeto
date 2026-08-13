/**
 * Codex integration setup
 * Supports two authentication modes:
 *   1. API Token — user pastes their OpenAI API key, stored in .geeto/codex.toml
 *   2. OAuth     — delegates to `codex login` which stores a token in ~/.codex/auth.json
 */

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { GLOBAL_GEETO_DIR } from '../utils/config.js'
import { log } from '../utils/logging.js'

// ── helpers ────────────────────────────────────────────────────────────────

/** Check whether the `codex` CLI is installed and available in PATH. */
const isCodexCliAvailable = (): boolean => {
  try {
    execSync('codex --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** Path to the global codex config stored by geeto. */
const getCodexConfigFilePath = (): string => path.join(GLOBAL_GEETO_DIR, 'codex.toml')

/** Read the API key (if any) that was stored by geeto. */
export const getStoredCodexApiKey = (): string | null => {
  try {
    const configPath = getCodexConfigFilePath()
    if (!fs.existsSync(configPath)) return null
    const content = fs.readFileSync(configPath, 'utf8')
    const match = content.match(/api_key\s*=\s*["']([^"']+)["']/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/** Check whether the user has authenticated via `codex login` (OAuth flow). */
const hasOAuthToken = (): boolean => {
  try {
    // The codex CLI stores OAuth tokens in ~/.codex/auth.json
    const authFile = path.join(os.homedir(), '.codex', 'auth.json')
    if (!fs.existsSync(authFile)) return false
    const raw = fs.readFileSync(authFile, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Valid if it contains at least one key (token or similar)
    return Object.keys(parsed).length > 0
  } catch {
    return false
  }
}

// ── Token auth ─────────────────────────────────────────────────────────────

const setupViaToken = (): boolean => {
  log.info('You can get your API key from https://platform.openai.com/api-keys')
  console.log('')

  const key = askQuestion('Paste your OpenAI API key (sk-...): ').trim()
  if (!key?.startsWith('sk-')) {
    log.warn('Invalid API key format. Expected a key starting with sk-')
    return false
  }

  try {
    if (!fs.existsSync(GLOBAL_GEETO_DIR)) {
      fs.mkdirSync(GLOBAL_GEETO_DIR, { recursive: true })
    }

    const configPath = getCodexConfigFilePath()
    const content =
      [
        '# Codex Configuration (managed by Geeto)',
        `# Generated on ${new Date().toISOString()}`,
        `auth_method = "token"`,
        `api_key = "${key}"`,
      ].join('\n') + '\n'

    fs.writeFileSync(configPath, content, 'utf8')
    log.success('API key saved to ~/.geeto/codex.toml')
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}

// ── OAuth auth ─────────────────────────────────────────────────────────────

/**
 * Run `codex login` interactively in the current terminal.
 * Returns true if the login process exited successfully and auth.json was written.
 */
const runCodexLogin = (): boolean => {
  log.info('Launching `codex login`...')
  console.log('')

  const result = spawnSync('codex', ['login'], { stdio: 'inherit' })

  console.log('')
  if (result.error) {
    log.error(`Failed to launch codex login: ${result.error.message}`)
    return false
  }
  if (result.status !== 0) {
    log.warn(`codex login exited with code ${result.status ?? '?'}`)
    return false
  }
  return true
}

const setupViaOAuth = async (): Promise<boolean> => {
  if (!isCodexCliAvailable()) {
    log.error('Codex CLI not found in PATH.')
    log.info('Install it first: npm install -g @openai/codex')
    log.info('Or: https://github.com/openai/codex')
    const proceed = confirm(
      'Save setup without verification? OpenAI Codex stays unavailable until the CLI is installed.',
      false
    )
    if (!proceed) return false
  }

  if (hasOAuthToken()) {
    log.success('OAuth token found in ~/.codex/auth.json — OpenAI Codex is already authenticated.')

    const { select } = await import('../cli/menu.js')
    const action = await select('OpenAI Codex is authenticated. Choose an account action:', [
      { label: 'Keep existing login (no changes)', value: 'keep' },
      { label: 'Re-login (switch account or refresh token)', value: 'relogin' },
      { label: 'Cancel OpenAI Codex setup', value: 'cancel' },
    ])

    if (action === 'cancel') return false
    if (action === 'relogin') {
      const ok = runCodexLogin()
      if (!ok) {
        const force = confirm(
          'Save OpenAI Codex setup without verification? OpenAI Codex may remain unavailable until authentication succeeds.',
          false
        )
        if (!force) return false
      } else if (hasOAuthToken()) {
        log.success('OAuth token verified!')
      } else {
        log.warn('OAuth token not detected after login. Setup may be incomplete.')
        const force = confirm(
          'Save OpenAI Codex setup without verification? OpenAI Codex may remain unavailable until authentication succeeds.',
          false
        )
        if (!force) return false
      }
    }
    // 'keep' → fall through to save sentinel
  } else {
    // No existing token — run codex login directly
    const ok = runCodexLogin()
    if (!ok) {
      log.warn('codex login did not complete successfully.')
      const force = confirm(
        'Save OpenAI Codex setup without verification? OpenAI Codex may remain unavailable until authentication succeeds.',
        false
      )
      if (!force) return false
    } else if (hasOAuthToken()) {
      log.success('OAuth token verified!')
    } else {
      log.warn('OAuth token not found in ~/.codex/auth.json after login.')
      const force = confirm(
        'Save OpenAI Codex setup without verification? OpenAI Codex may remain unavailable until authentication succeeds.',
        false
      )
      if (!force) return false
    }
  }

  // Write sentinel config marking auth method as oauth
  try {
    if (!fs.existsSync(GLOBAL_GEETO_DIR)) {
      fs.mkdirSync(GLOBAL_GEETO_DIR, { recursive: true })
    }
    const configPath = getCodexConfigFilePath()
    const content =
      [
        '# Codex Configuration (managed by Geeto)',
        `# Generated on ${new Date().toISOString()}`,
        `auth_method = "oauth"`,
      ].join('\n') + '\n'

    fs.writeFileSync(configPath, content, 'utf8')
    log.success('OpenAI Codex OAuth configuration saved.')
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}

// ── Main entry ─────────────────────────────────────────────────────────────

export const setupCodexConfigInteractive = async (): Promise<boolean> => {
  if (!isCodexCliAvailable()) {
    log.warn('Codex CLI not found in PATH.')
    log.info('Install: npm install -g @openai/codex')
    log.info('Docs: https://github.com/openai/codex')
    console.log('')
  }

  const authMethod = await select('Choose OpenAI Codex authentication method:', [
    {
      label: 'API Token — paste your OpenAI API key (sk-...)',
      value: 'token',
    },
    {
      label: 'OAuth — use `codex login` (browser-based login)',
      value: 'oauth',
    },
    { label: 'Cancel OpenAI Codex setup', value: 'back' },
  ])

  if (authMethod === 'back') return false

  if (authMethod === 'token') {
    return setupViaToken()
  }

  return await setupViaOAuth()
}
