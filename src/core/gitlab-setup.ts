/**
 * GitLab integration setup
 */

import fs from 'node:fs'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { GLOBAL_GEETO_DIR, resolveConfigPath } from '../utils/config.js'
import { ensurePrivateDirectory, writeCredentialFile } from '../utils/credentials.js'
import { exec, openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

const detectGlabToken = (): string | null => {
  try {
    const token = exec('glab auth token', true).trim()
    if (token?.startsWith('glpat-')) return token
    if (token && token.length > 20) return token
  } catch {}
  return null
}

export const setupGitlabConfigInteractive = (): boolean => {
  try {
    if (fs.existsSync(resolveConfigPath('gitlab.toml'))) return true
  } catch {
    // fall through to interactive setup
  }

  log.info('Connect GitLab to create merge requests and issues from Geeto.\n')
  log.info('Use a Personal Access Token with api scope, or an authenticated GitLab CLI.\n')

  const shouldSetup = confirm('Connect GitLab now?')
  if (!shouldSetup) return false

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const detectedToken = detectGlabToken()
  let token = ''

  if (detectedToken) {
    log.success('Detected GitLab token from `glab` CLI!')
    const useDetected = confirm('Use the token detected from the `glab` CLI?')
    if (useDetected) token = detectedToken
  }

  if (!token) {
    log.info('Create a token at: Settings → Access Tokens')
    log.info('Required scopes: api (Full access to the API)\n')
    const openNow = confirm('Open the GitLab token page in your browser now?')
    if (openNow) {
      const opened = openBrowser('https://gitlab.com/-/user_settings/personal_access_tokens')
      if (opened) log.success('Opened browser')
      else log.warn('Could not open browser—please open the URL above manually')
    }
    token = askQuestion('Enter GitLab Personal Access Token: ').trim()
    if (!token) {
      log.error('Token is required')
      return false
    }

    const looksValid = token.startsWith('glpat-') || token.length > 20
    if (!looksValid) {
      log.warn('Token format looks unusual')
      log.info('Saving anyway—if authentication fails, re-run setup with a valid token.')
    }
  }

  const instanceUrl =
    askQuestion('GitLab instance URL (press Enter for gitlab.com): ').trim() || 'https://gitlab.com'

  const configDir = GLOBAL_GEETO_DIR
  const configPath = path.join(configDir, 'gitlab.toml')

  try {
    ensurePrivateDirectory(configDir)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to create config directory: ${msg}`)
    return false
  }

  const configContent = `# Geeto GitLab Configuration\n# Generated on ${new Date().toISOString()}\n\ntoken = "${token}"\nurl = "${instanceUrl}"\n`
  try {
    writeCredentialFile(configPath, configContent)
    log.success(`GitLab config saved to: ${configPath}`)
    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to save config: ${msg}`)
    return false
  }
}
