/**
 * AI Provider selection workflow - handles AI provider and model selection
 */

import type { GeminiModel } from '../api/gemini.js'
import type { GroqModel } from '../api/groq.js'
import type { OpenRouterModel } from '../api/openrouter.js'

// SelectOption type previously used for model lists; not needed after refactor

import { select } from '../cli/menu.js'
import { chooseModelForProvider } from '../utils/git-ai.js'

export const handleAIProviderSelection = async (): Promise<{
  aiProvider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen' | 'manual'
  openrouterModel?: OpenRouterModel
  geminiModel?: GeminiModel
  groqModel?: GroqModel
  codexModel?: string
  opencodeModel?: string
}> => {
  let aiProvider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen' | 'manual'
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined
  let groqModel: GroqModel | undefined
  let codexModel: string | undefined
  let opencodeModel: string | undefined

  // AI provider selection loop
  while (true) {
    aiProvider = (await select('Choose a provider for branch names and commit messages:', [
      { label: 'Gemini', value: 'gemini' },
      { label: 'OpenRouter', value: 'openrouter' },
      { label: 'Groq', value: 'groq' },
      { label: 'OpenAI Codex', value: 'codex' },
      { label: 'OpenCode Zen', value: 'opencode-zen' },
      { label: 'Write names and messages yourself', value: 'manual' },
    ])) as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen' | 'manual'

    // Setup the selected AI provider using centralized helper where possible
    if (aiProvider === 'manual') {
      // No model selection required; proceed
      break
    }

    const chosen = await chooseModelForProvider(
      aiProvider as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
      undefined,
      'Back to AI provider menu'
    )
    if (!chosen) {
      // setup failed or was cancelled; re-run provider selection
      continue
    }
    if (chosen === 'back') {
      continue
    }

    // Assign chosen model to the appropriate variable
    switch (aiProvider) {
      case 'gemini': {
        geminiModel = chosen as GeminiModel

        break
      }
      case 'openrouter': {
        openrouterModel = chosen as OpenRouterModel

        break
      }
      case 'groq': {
        groqModel = chosen

        break
      }
      case 'codex': {
        codexModel = chosen
        break
      }
      case 'opencode-zen': {
        opencodeModel = chosen
        break
      }
      // No default
    }

    // If we get here, user has made their choice
    break
  }

  return { aiProvider, openrouterModel, geminiModel, groqModel, codexModel, opencodeModel }
}
