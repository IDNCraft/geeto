import { log } from '../utils/logging.js'

/**
 * Check and setup gemini API + API key
 */
export const ensureGemini = async (): Promise<boolean> => {
  try {
    const { getGeminiConfig, getGeminiConfigPath } = await import('../utils/config.js')
    const { existsSync } = await import('node:fs')
    if (existsSync(getGeminiConfigPath())) {
      const { apiKey } = getGeminiConfig()
      log.info(`Gemini API key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'configured'}`)
      return true
    }
    const mod = await import('./gemini-setup.js')
    if (typeof mod.setupGeminiConfigInteractive === 'function') {
      return mod.setupGeminiConfigInteractive()
    }
  } catch {
    log.warn('Gemini setup could not be loaded. Run `geeto --setup-gemini` again.')
  }
  return false
}

/**
 * Check and setup OpenRouter API key
 */
export const ensureOpenRouter = async (): Promise<boolean> => {
  try {
    const { getOpenRouterConfig, getOpenRouterConfigPath } = await import('../utils/config.js')
    const { existsSync } = await import('node:fs')
    if (existsSync(getOpenRouterConfigPath())) {
      const { apiKey } = getOpenRouterConfig()
      log.info(`OpenRouter API key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'configured'}`)
      return true
    }
    const mod = await import('./openrouter-setup.js')
    if (typeof mod.setupOpenRouterConfigInteractive === 'function') {
      return mod.setupOpenRouterConfigInteractive()
    }
  } catch {
    log.warn('OpenRouter setup could not be loaded. Run `geeto --setup-openrouter` again.')
  }
  return false
}

/**
 * Export Trello setup instructions
 */
export const setupTrelloConfig = (): void => {
  log.info('Trello integration is not configured.')
  log.info('To enable Trello integration, create a config file at:')
  log.info('  .geeto/trello.toml')
  log.info('')
  log.info('With the following content:')
  log.info('  api_key = "YOUR_TRELLO_API_KEY"')
  log.info('  token = "YOUR_TRELLO_TOKEN"')
  log.info('  board_id = "YOUR_TRELLO_BOARD_ID"')
  log.info('')
  log.info('Get your API key from: https://trello.com/app-key')
  log.info('Generate a token by clicking the "Token" link on that page')
  log.info('Find your board ID in the board URL: trello.com/b/{BOARD_ID}/')
}

/**
 * Unified AI provider setup function
 */
export const ensureGroq = async (): Promise<boolean> => {
  try {
    const { getGroqConfig, getGroqConfigPath } = await import('../utils/config.js')
    const { existsSync } = await import('node:fs')
    if (existsSync(getGroqConfigPath())) {
      const { apiKey } = getGroqConfig()
      log.info(`Groq API key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'configured'}`)
      return true
    }
    const mod = await import('./groq-setup.js')
    if (typeof mod.setupGroqConfigInteractive === 'function') {
      return mod.setupGroqConfigInteractive()
    }
  } catch {
    log.warn('Groq setup could not be loaded. Run `geeto --setup-groq` again.')
  }
  return false
}

export const ensureCodex = async (): Promise<boolean> => {
  try {
    const { hasCodexConfig } = await import('../utils/config.js')
    if (hasCodexConfig()) {
      return true
    }
    const mod = await import('./codex-sdk-setup.js')
    if (typeof mod.setupCodexConfigInteractive === 'function') {
      return mod.setupCodexConfigInteractive()
    }
  } catch {
    log.warn('OpenAI Codex setup helper not available.')
  }
  return false
}

export const ensureOpenCode = async (): Promise<boolean> => {
  try {
    const { isAvailable } = await import('../api/opencode.js')
    if (isAvailable()) return true
  } catch {
    // fall through to the setup message
  }

  log.warn('OpenCode Zen is not available in PATH.')
  log.info('Install it from https://opencode.ai/docs/installation/')
  return false
}

export const ensureAIProvider = async (
  aiProvider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen'
): Promise<boolean> => {
  switch (aiProvider) {
    case 'gemini': {
      return ensureGemini()
    }
    case 'openrouter': {
      return ensureOpenRouter()
    }
    case 'groq': {
      return ensureGroq()
    }
    case 'codex': {
      return ensureCodex()
    }
    case 'opencode-zen': {
      return ensureOpenCode()
    }
    default: {
      log.error(`Unknown AI provider: ${aiProvider}`)
      return false
    }
  }
}
