/**
 * Codex integration setup
 * Supports API token and isolated OAuth authentication.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getCodexBinaryPath,
  getCodexEnvironment,
  installCodexRuntime,
  isAvailable as isCodexRuntimeAvailable,
  prepareCodexRuntimeHome,
} from '../api/codex-sdk.js'
import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { GLOBAL_GEETO_DIR } from '../utils/config.js'
import { ensurePrivateDirectory, writeCredentialFile } from '../utils/credentials.js'
import { log } from '../utils/logging.js'

const isCodexCliAvailable = (): boolean => isCodexRuntimeAvailable()

const getCodexConfigFilePath = (): string => path.join(GLOBAL_GEETO_DIR, 'codex.toml')

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

const hasOAuthToken = (): boolean => {
  const authFiles = [path.join(os.homedir(), '.codex', 'auth.json')]
  const runtimeHome = getCodexEnvironment().HOME
  if (runtimeHome) authFiles.push(path.join(runtimeHome, '.codex', 'auth.json'))

  for (const authFile of authFiles) {
    try {
      if (!fs.existsSync(authFile)) continue
      const raw = fs.readFileSync(authFile, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (Object.keys(parsed).length > 0) return true
    } catch {
      // Try the next auth location.
    }
  }

  return false
}

const setupViaToken = (): boolean => {
  log.info('You can get your API key from https://platform.openai.com/api-keys')
  console.log('')

  const key = askQuestion('Paste your OpenAI API key (sk-...): ').trim()
  if (!key.startsWith('sk-')) {
    log.warn('Invalid API key format. Expected a key starting with sk-')
    return false
  }

  try {
    ensurePrivateDirectory(GLOBAL_GEETO_DIR)

    const configPath = getCodexConfigFilePath()
    const content =
      [
        '# Codex Configuration (managed by Geeto)',
        `# Generated on ${new Date().toISOString()}`,
        `auth_method = "token"`,
        `api_key = "${key}"`,
      ].join('\n') + '\n'

    writeCredentialFile(configPath, content)
    log.success('API key saved to ~/.geeto/codex.toml')
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}

const runCodexLogin = (): boolean => {
  const codexPath = getCodexBinaryPath()
  if (!codexPath) {
    log.error('Codex isolated runtime is unavailable.')
    return false
  }

  log.info('Launching isolated `codex login`...')
  console.log('')
  prepareCodexRuntimeHome()

  const result = spawnSync(codexPath, ['login'], {
    stdio: 'inherit',
    env: getCodexEnvironment(codexPath),
  })

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
    log.error('Codex isolated runtime is unavailable.')
    log.info('Install npm or Bun, then rerun `geeto --setup-codex`.')
    const proceed = confirm(
      'Save setup without verification? OpenAI Codex stays unavailable until the isolated runtime is installed.',
      false
    )
    if (!proceed) return false
  }

  if (hasOAuthToken()) {
    log.success('OAuth token found — OpenAI Codex is already authenticated.')

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
  } else {
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
      log.warn('OAuth token not found after login.')
      const force = confirm(
        'Save OpenAI Codex setup without verification? OpenAI Codex may remain unavailable until authentication succeeds.',
        false
      )
      if (!force) return false
    }
  }

  try {
    ensurePrivateDirectory(GLOBAL_GEETO_DIR)
    const configPath = getCodexConfigFilePath()
    const content =
      [
        '# Codex Configuration (managed by Geeto)',
        `# Generated on ${new Date().toISOString()}`,
        `auth_method = "oauth"`,
      ].join('\n') + '\n'

    writeCredentialFile(configPath, content)
    log.success('OpenAI Codex OAuth configuration saved.')
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}

export const setupCodexConfigInteractive = async (): Promise<boolean> => {
  if (!isCodexCliAvailable()) {
    log.info('OpenAI Codex isolated runtime is not installed. Setting it up...')
    if (!installCodexRuntime()) {
      log.warn('OpenAI Codex isolated runtime setup failed.')
    }
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
  if (authMethod === 'token') return setupViaToken()
  return setupViaOAuth()
}
