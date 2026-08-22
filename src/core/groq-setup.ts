/**
 * Groq integration setup
 */

import fs from 'node:fs'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { GLOBAL_GEETO_DIR, resolveConfigPath } from '../utils/config.js'
import { ensurePrivateDirectory, writeCredentialFile } from '../utils/credentials.js'
import { openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

export const setupGroqConfigInteractive = (): boolean => {
  try {
    if (fs.existsSync(resolveConfigPath('groq.toml'))) return true
  } catch {
    // fall through to interactive setup
  }

  log.info('Use Groq for fast AI-generated branches, commits, and release notes.')
  log.info('Free models are available; usage limits depend on your Groq account.')
  log.info('Your API key will be saved to ~/.geeto/groq.toml and reused across projects.')
  log.info('Get a key from: https://console.groq.com/keys\n')

  const shouldSetup = confirm('Connect Groq now?')
  if (!shouldSetup) return false

  const openKeyPage = confirm('Open Groq API key page in your browser?')
  if (openKeyPage) {
    const opened = openBrowser('https://console.groq.com/keys')
    if (!opened) log.warn('Could not open browser — visit https://console.groq.com/keys manually')
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const apiKey = askQuestion('Enter Groq API Key: ').trim()
  if (!apiKey) {
    log.warn('No API key entered; Groq setup was not saved. Run `geeto --setup-groq` to try again.')
    return false
  }

  if (!apiKey.startsWith('gsk_')) {
    log.warn('API key format looks unusual (expected: starts with "gsk_").')
    log.info('Saving anyway — if authentication fails, re-run setup with a valid key.')
  }

  const configDir = GLOBAL_GEETO_DIR
  const configPath = path.join(configDir, 'groq.toml')

  try {
    ensurePrivateDirectory(configDir)
  } catch (error) {
    log.error(`Failed to create config directory: ${(error as Error).message}`)
    return false
  }

  const content = `# Geeto Groq Configuration
# Generated on ${new Date().toISOString()}
# Free API key from https://console.groq.com/keys

api_key = "${apiKey}"
`

  try {
    writeCredentialFile(configPath, content)
    log.success(`Groq config saved to: ${configPath}`)
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}
