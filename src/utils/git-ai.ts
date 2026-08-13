import type { GeminiModel } from '../api/gemini.js'
import type { GroqModel } from '../api/groq.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { DEFAULT_GEMINI_MODEL } from './config.js'
import { isContextLimitFailure, isTransientAIFailure } from './git-ai-errors.js'
import { ScrambleProgress } from './scramble.js'
import { log } from '../utils/logging.js'

// Re-export error detection functions for backward compatibility
export { isContextLimitFailure, isTransientAIFailure }

// execGit not needed here

/** Return the canonical string value for a model (object or string) */
export function getModelValue(m?: OpenRouterModel | GeminiModel | string): string | undefined {
  if (!m) {
    return undefined
  }
  if (typeof m === 'string') {
    return m
  }
  // model objects expose a `value` property in our menus
  return (m as unknown as { value?: string }).value
}

/** Return a friendly provider name. */
export function getAIProviderDisplayName(aiProvider: string): string {
  switch (aiProvider) {
    case 'gemini': {
      return 'Gemini'
    }
    case 'openrouter': {
      return 'OpenRouter'
    }
    case 'groq': {
      return 'Groq'
    }
    case 'codex': {
      return 'OpenAI Codex'
    }
    case 'opencode-zen': {
      return 'OpenCode Zen'
    }
    default: {
      return 'Manual'
    }
  }
}

/** Short provider name for brief displays. */
export function getAIProviderShortName(aiProvider: string): string {
  switch (aiProvider) {
    case 'gemini': {
      return 'Gemini'
    }
    case 'openrouter': {
      return 'OpenRouter'
    }
    case 'groq': {
      return 'Groq'
    }
    case 'codex': {
      return 'OpenAI Codex'
    }
    case 'opencode-zen': {
      return 'OpenCode Zen'
    }
    default: {
      return 'Manual'
    }
  }
}

/** Return the model to show for a provider. */
export function getModelDisplayName(aiProvider: string, model?: string): string {
  if (aiProvider === 'gemini') {
    // don't rely on config-stored model; prefer explicit model param then default
    return model ?? DEFAULT_GEMINI_MODEL
  }

  if (!model) {
    return ''
  }

  return model
}

/** Ask the right provider to generate a branch-name suffix. */
export async function generateBranchNameWithProvider(
  aiProvider: string,
  title: string,
  correction?: string,
  _model?: OpenRouterModel | GeminiModel | string,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel,
  groqModel?: GroqModel,
  codexModel?: string,
  opencodeModel?: string
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateBranchName } = await import('../api/gemini.js')
      return generateBranchName(title, correction, geminiModel as GeminiModel)
    }
    case 'groq': {
      const { generateBranchName } = await import('../api/groq.js')
      return generateBranchName(title, correction, groqModel)
    }
    case 'codex': {
      const { generateBranchName } = await import('../api/codex.js')
      return generateBranchName(title, correction, codexModel)
    }
    case 'opencode-zen': {
      const { generateBranchName } = await import('../api/opencode.js')
      return generateBranchName(title, correction, opencodeModel)
    }
    default: {
      const { generateBranchName } = await import('../api/openrouter.js')
      return generateBranchName(title, correction, openrouterModel)
    }
  }
}

export async function generateReleaseNotesWithProvider(
  aiProvider: string,
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  _model?: OpenRouterModel | GeminiModel | string,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel,
  groqModel?: GroqModel,
  codexModel?: string,
  opencodeModel?: string
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateReleaseNotes } = await import('../api/gemini.js')
      return generateReleaseNotes(commits, language, correction, geminiModel as GeminiModel)
    }
    case 'groq': {
      const { generateReleaseNotes } = await import('../api/groq.js')
      return generateReleaseNotes(commits, language, correction, groqModel)
    }
    case 'codex': {
      const { generateReleaseNotes } = await import('../api/codex.js')
      return generateReleaseNotes(commits, language, correction, codexModel)
    }
    case 'opencode-zen': {
      const { generateReleaseNotes } = await import('../api/opencode.js')
      return generateReleaseNotes(commits, language, correction, opencodeModel)
    }
    default: {
      const { generateReleaseNotes } = await import('../api/openrouter.js')
      return generateReleaseNotes(commits, language, correction, openrouterModel)
    }
  }
}

/** Send a raw text prompt to the configured AI provider and return the response. */
export async function generateTextWithProvider(
  aiProvider: string,
  prompt: string,
  _model?: OpenRouterModel | GeminiModel | string,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel,
  groqModel?: GroqModel,
  codexModel?: string,
  opencodeModel?: string
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateText } = await import('../api/gemini.js')
      return generateText(prompt, geminiModel as GeminiModel)
    }
    case 'groq': {
      const { generateText } = await import('../api/groq.js')
      return generateText(prompt, groqModel)
    }
    case 'codex': {
      const { generateText } = await import('../api/codex.js')
      return generateText(prompt, codexModel)
    }
    case 'opencode-zen': {
      const { generateText } = await import('../api/opencode.js')
      return generateText(prompt, opencodeModel)
    }
    default: {
      const { generateText } = await import('../api/openrouter.js')
      return generateText(prompt, openrouterModel)
    }
  }
}

/** Ask the right provider to generate a commit message from a diff. */
export async function generateCommitMessageWithProvider(
  aiProvider: string,
  diff: string,
  correction?: string,
  _model?: OpenRouterModel | GeminiModel | string,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel,
  groqModel?: GroqModel,
  codexModel?: string,
  opencodeModel?: string
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateCommitMessage } = await import('../api/gemini.js')
      return generateCommitMessage(diff, correction, geminiModel as GeminiModel)
    }
    case 'groq': {
      const { generateCommitMessage } = await import('../api/groq.js')
      return generateCommitMessage(diff, correction, groqModel)
    }
    case 'codex': {
      const { generateCommitMessage } = await import('../api/codex.js')
      return generateCommitMessage(diff, correction, codexModel)
    }
    case 'opencode-zen': {
      const { generateCommitMessage } = await import('../api/opencode.js')
      return generateCommitMessage(diff, correction, opencodeModel)
    }
    default: {
      const { generateCommitMessage } = await import('../api/openrouter.js')
      return generateCommitMessage(diff, correction, openrouterModel)
    }
  }
}

/**
 * Interactive fallback menu when AI generation fails.
 */
export async function interactiveAIFallback(
  currentSuffix: string | null,
  aiProvider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
  model: OpenRouterModel | GeminiModel | string,
  diff: string,
  correction: string,
  _currentBranch: string,
  updateModel: (
    provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
    model?: OpenRouterModel | GeminiModel | string
  ) => void,
  isCommit: boolean = false
): Promise<string | null> {
  const { select } = await import('../cli/menu.js')

  const isTransientFailure = isTransientAIFailure

  let aiSuffix = currentSuffix
  const failedModels = new Set<string>()
  // track the current model (may be a string or a provider-specific model object)
  let currentModel: OpenRouterModel | GeminiModel | string | undefined = model

  // Loop until manual pick or non-rate result
  while (true) {
    // If we have a valid suffix (not a failure), return it
    if (aiSuffix && !isTransientFailure(aiSuffix)) {
      return aiSuffix
    }

    // aiSuffix is null/transient — show interactive alternatives menu
    let choices = [
      {
        label: `Try a different ${getAIProviderShortName(aiProvider)} model`,
        value: 'different-model',
      },
      { label: 'Try a different AI provider', value: 'different-provider' },
      { label: 'Enter the result manually', value: 'manual' },
    ]

    // If this failure is due to context/token limits, prefer forcing the user
    // to pick a different model or provider (retrying the same model won't help).
    const contextLimit = isContextLimitFailure(aiSuffix)
    if (contextLimit && typeof currentModel === 'string') {
      // mark the current model string as failed to avoid reselecting it
      failedModels.add(currentModel)
    }

    if (aiSuffix && isTransientFailure(aiSuffix)) {
      // Decide whether to show "Try a different <provider> model".
      // Hide it when there are no alternative models left or when the
      // failure clearly indicates provider-wide quota exhaustion.
      const low = String(aiSuffix).toLowerCase()
      let showDifferentModel = true

      // If message clearly indicates quota or subscription problem, don't offer model switch
      if (
        low.includes('quota') ||
        low.includes('no quota') ||
        low.includes('quota_exceeded') ||
        low.includes('insufficient') ||
        low.includes('payment') ||
        /subscription/.test(low)
      ) {
        showDifferentModel = false
      } else {
        // Otherwise, check whether there are alternative models available
        switch (aiProvider) {
          case 'gemini': {
            const gem = await import('../api/gemini.js')
            const models = await gem.getGeminiModels()
            // Always offer all models (do not hide models marked as failed)
            const available = models as Array<{ label: string; value: string }>
            if (available.length === 0) {
              showDifferentModel = false
            }
            break
          }
          case 'openrouter': {
            const open = await import('../api/openrouter.js')
            const models = await open.getOpenRouterModels()
            // Always offer all models (do not hide models marked as failed)
            const available = models
            if (available.length === 0) {
              showDifferentModel = false
            }
            break
          }
          default: {
            break
          }
        }
      }

      choices = [
        {
          label: `Try again with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} model`,
          value: 'retry-current',
        },
        ...(showDifferentModel
          ? [
              {
                label: `Try a different ${getAIProviderShortName(aiProvider)} model`,
                value: 'different-model',
              },
            ]
          : []),
        { label: 'Try a different AI provider', value: 'different-provider' },
        { label: 'Enter the result manually', value: 'manual' },
      ]
    }

    // Use short provider name and show a context-aware prompt
    const shortName = getAIProviderShortName(aiProvider)

    // Detect network/connectivity style failures so we can offer a retry
    const lowForNetwork = aiSuffix ? String(aiSuffix).toLowerCase() : ''
    const isNetworkError =
      aiSuffix === null ||
      aiSuffix === undefined ||
      lowForNetwork.includes('unable to connect') ||
      lowForNetwork.includes('failed to fetch') ||
      lowForNetwork.includes('network') ||
      lowForNetwork.includes('connection') ||
      /enotfound|econnrefused|timeout/.test(lowForNetwork)

    if (isNetworkError) {
      // Offer a retry with the current provider/model as the first choice
      choices = [
        {
          label: `Try again with current ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} model`,
          value: 'retry-current',
        },
        ...choices,
      ]
    }

    let promptMsg: string
    if (aiSuffix === null || aiSuffix === undefined) {
      promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} returned no suggestion. Retry, switch model/provider, or use manual input:`
    } else {
      const low = String(aiSuffix).toLowerCase()
      if (
        low.includes('rate') ||
        low.includes('quota') ||
        low.includes('insufficient') ||
        low.includes('payment') ||
        /subscription/.test(low)
      ) {
        // Rate/quota/subscription style problems
        promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} is limited (rate/quota). Choose a recovery action:`
      } else {
        // Generic fallback message
        promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} returned an error. Retry, switch model/provider, or use manual input:`
      }
    }

    const pick = await select(promptMsg, choices)

    if (pick === 'manual') {
      return null
    }

    if (pick === 'retry-current') {
      // Re-run generation with the same provider and model
      switch (aiProvider) {
        case 'gemini': {
          const gem = await import('../api/gemini.js')
          const { generateBranchName, generateCommitMessage } = gem
          const spinner = new ScrambleProgress()
          spinner.start([
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
          ])
          if (isCommit) {
            const res = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as GeminiModel
            )
            aiSuffix = res
          } else {
            const res = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as GeminiModel
            )
            aiSuffix = res
          }
          spinner.stop()
          break
        }
        case 'openrouter': {
          const or = await import('../api/openrouter.js')
          const { generateBranchName, generateCommitMessage } = or
          const spinner = new ScrambleProgress()
          spinner.start([
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
          ])
          if (isCommit) {
            const res = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as OpenRouterModel
            )
            aiSuffix = res
          } else {
            const res = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as OpenRouterModel
            )
            aiSuffix = res
          }
          spinner.stop()
          break
        }
        case 'groq': {
          const groqApi = await import('../api/groq.js')
          const { generateBranchName, generateCommitMessage } = groqApi
          const spinner = new ScrambleProgress()
          spinner.start([
            `Retrying with Groq${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          } else {
            aiSuffix = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          }
          spinner.stop()
          break
        }
        case 'codex': {
          const codexApi = await import('../api/codex.js')
          const { generateBranchName, generateCommitMessage } = codexApi
          const spinner = new ScrambleProgress()
          spinner.start([
            `Retrying with Codex${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          } else {
            aiSuffix = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          }
          spinner.stop()
          break
        }
        case 'opencode-zen': {
          const opencodeApi = await import('../api/opencode.js')
          const { generateBranchName, generateCommitMessage } = opencodeApi
          const spinner = new ScrambleProgress()
          spinner.start([
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          } else {
            aiSuffix = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as string
            )
          }
          spinner.stop()
          break
        }
        default: {
          break
        }
      }

      // If retry produced a transient failure, record it to avoid immediate reselection
      if (isTransientFailure(aiSuffix) && typeof currentModel === 'string') {
        failedModels.add(currentModel)
      }

      continue
    }

    if (pick === 'different-model') {
      if (aiProvider === 'gemini') {
        const gem = await import('../api/gemini.js')
        const { generateBranchName, generateCommitMessage, getGeminiModels } = gem
        const models = await getGeminiModels()
        const gemOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to recovery options', value: 'back' }]
        const chosen = await select('Choose a different Gemini model:', gemOptions)
        if (chosen === 'back') {
          continue // Return to recovery options
        }
        // user already selected a model from the menu — apply it immediately
        currentModel = chosen as GeminiModel
        updateModel?.('gemini', chosen as GeminiModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Gemini (${chosen})`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as GeminiModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(
            diff || 'Code changes',
            correction,
            chosen as GeminiModel
          )
          aiSuffix = res
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen as string)
        }
        continue
      }

      if (aiProvider === 'openrouter') {
        const or = await import('../api/openrouter.js')
        const { generateBranchName, generateCommitMessage, getOpenRouterModels } = or
        const models = await getOpenRouterModels()
        const orOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to recovery options', value: 'back' }]
        const chosen = await select('Choose a different OpenRouter model:', orOptions)
        if (chosen === 'back') {
          continue // Return to recovery options
        }
        // user already selected a model from the menu — apply it immediately
        currentModel = chosen as OpenRouterModel
        updateModel?.('openrouter', chosen as OpenRouterModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenRouter (${chosen})`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as OpenRouterModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(
            diff || 'Code changes',
            correction,
            chosen as OpenRouterModel
          )

          aiSuffix = res
        }
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen as string)
        }
        continue
      }

      if (aiProvider === 'groq') {
        const groqApi = await import('../api/groq.js')
        const { generateBranchName, generateCommitMessage, getGroqModels } = groqApi
        const models = await getGroqModels()
        const groqOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to recovery options', value: 'back' }]
        const chosen = await select('Choose a different Groq model:', groqOptions)
        if (chosen === 'back') {
          continue
        }
        currentModel = chosen
        updateModel?.('groq', chosen)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Groq (${chosen})`,
        ])
        if (isCommit) {
          aiSuffix = await generateCommitMessage(diff, correction, chosen)
        } else {
          aiSuffix = await generateBranchName(diff || 'Code changes', correction, chosen)
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen)
        }
        continue
      }

      if (aiProvider === 'codex') {
        const codexApi = await import('../api/codex.js')
        const { generateBranchName, generateCommitMessage, getCodexModels } = codexApi
        const models = await getCodexModels()
        const codexOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to recovery options', value: 'back' }]
        const chosen = await select('Choose a different OpenAI Codex model:', codexOptions)
        if (chosen === 'back') {
          continue
        }
        currentModel = chosen
        updateModel?.('codex', chosen)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Codex`,
        ])
        if (isCommit) {
          aiSuffix = await generateCommitMessage(diff, correction, chosen)
        } else {
          aiSuffix = await generateBranchName(diff || 'Code changes', correction, chosen)
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen)
        }
        continue
      }

      if (aiProvider === 'opencode-zen') {
        const opencodeApi = await import('../api/opencode.js')
        const { generateBranchName, generateCommitMessage, getOpenCodeModels } = opencodeApi
        const models = await getOpenCodeModels()
        const opencodeOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to recovery options', value: 'back' }]
        const chosen = await select('Choose a different OpenCode Zen model:', opencodeOptions)
        if (chosen === 'back') {
          continue
        }
        currentModel = chosen
        updateModel?.('opencode-zen', chosen)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenCode Zen (${chosen})`,
        ])
        if (isCommit) {
          aiSuffix = await generateCommitMessage(diff, correction, chosen)
        } else {
          aiSuffix = await generateBranchName(diff || 'Code changes', correction, chosen)
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen)
        }
        continue
      }
    }

    if (pick === 'different-provider') {
      const providers = ['gemini', 'openrouter', 'groq', 'codex', 'opencode-zen'].filter(
        (p) => p !== aiProvider
      )
      const providerOptions = providers.map((p) => ({
        label: getAIProviderDisplayName(p),
        value: p,
      }))
      const provOptionsWithBack = providerOptions.some((p) => p.value === 'back')
        ? providerOptions
        : [...providerOptions, { label: 'Back to recovery options', value: 'back' }]
      const pickProv = await select(
        'Which AI provider should retry the request?',
        provOptionsWithBack
      )
      if (pickProv === 'back') {
        continue // return to try-again model selection
      }

      switch (pickProv) {
        case 'gemini': {
          // user selected Gemini provider — allow model choice and apply immediately
          log.info(`Selected AI Provider: Gemini`)
          const { ensureAIProvider } = await import('../core/setup.js')
          const geminiReady = await ensureAIProvider('gemini')
          if (!geminiReady) {
            continue
          }
          const gem = await import('../api/gemini.js')
          const models = await gem.getGeminiModels()
          const gemOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to recovery options', value: 'back' }]
          const chosenModel = await select(
            'Which Gemini model should retry the request?',
            gemOptions
          )
          if (chosenModel === 'back') {
            continue // Return to recovery options
          }
          // set active provider + model for subsequent retries
          aiProvider = 'gemini'
          currentModel = chosenModel as GeminiModel
          updateModel?.('gemini', chosenModel as GeminiModel)
          const spinner = new ScrambleProgress()
          spinner.start([
            `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Gemini (${chosenModel})`,
          ])

          if (isCommit) {
            // Use built-in Gemini API for commit generation
            const res = await gem.generateCommitMessage(
              diff,
              correction,
              chosenModel as GeminiModel
            )
            aiSuffix = res
          } else {
            const res = await gem.generateBranchName(diff, correction, chosenModel as GeminiModel)
            aiSuffix = res
          }
          spinner.stop()

          break
        }
        case 'openrouter': {
          log.info(`Selected AI Provider: OpenRouter`)
          const { ensureAIProvider } = await import('../core/setup.js')
          const openrouterReady = await ensureAIProvider('openrouter')
          if (!openrouterReady) {
            continue
          }
          const or = await import('../api/openrouter.js')
          const { generateBranchName, generateCommitMessage, getOpenRouterModels } = or
          const models = await getOpenRouterModels()
          const orOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to recovery options', value: 'back' }]
          const chosen = await select('Which OpenRouter model should retry the request?', orOptions)
          if (chosen === 'back') {
            continue
          }
          aiProvider = 'openrouter'
          currentModel = chosen as OpenRouterModel
          updateModel?.('openrouter', chosen as OpenRouterModel)
          const spinner = new ScrambleProgress()
          spinner.start([
            `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenRouter (${chosen})`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(diff, correction, chosen as OpenRouterModel)
          } else {
            aiSuffix = await generateBranchName(diff, correction, chosen as OpenRouterModel)
          }
          spinner.stop()

          break
        }
        case 'groq': {
          log.info(`Selected AI Provider: Groq`)
          const { ensureAIProvider } = await import('../core/setup.js')
          const groqReady = await ensureAIProvider('groq')
          if (!groqReady) {
            continue
          }
          const groqApi = await import('../api/groq.js')
          const { generateBranchName, generateCommitMessage, getGroqModels } = groqApi
          const models = await getGroqModels()
          const groqOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to recovery options', value: 'back' }]
          const chosen = await select('Which Groq model should retry the request?', groqOptions)
          if (chosen === 'back') {
            continue
          }
          aiProvider = 'groq'
          currentModel = chosen
          updateModel?.('groq', chosen)
          const spinner = new ScrambleProgress()
          spinner.start([
            `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Groq (${chosen})`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(diff, correction, chosen)
          } else {
            aiSuffix = await generateBranchName(diff, correction, chosen)
          }
          spinner.stop()

          break
        }
        case 'codex': {
          log.info(`Selected AI Provider: OpenAI Codex`)
          const { ensureAIProvider } = await import('../core/setup.js')
          const codexReady = await ensureAIProvider('codex')
          if (!codexReady) {
            continue
          }
          const codexApi = await import('../api/codex.js')
          const { generateBranchName, generateCommitMessage, getCodexModels } = codexApi
          const models = await getCodexModels()
          const codexOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to recovery options', value: 'back' }]
          const chosen = await select(
            'Which OpenAI Codex model should retry the request?',
            codexOptions
          )
          if (chosen === 'back') {
            continue
          }
          aiProvider = 'codex'
          currentModel = chosen
          updateModel?.('codex', chosen)
          const spinner = new ScrambleProgress()
          spinner.start([
            `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Codex`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(diff, correction, chosen)
          } else {
            aiSuffix = await generateBranchName(diff, correction, chosen)
          }
          spinner.stop()

          break
        }
        case 'opencode-zen': {
          log.info(`Selected AI Provider: OpenCode Zen`)
          const { ensureAIProvider } = await import('../core/setup.js')
          const opencodeReady = await ensureAIProvider('opencode-zen')
          if (!opencodeReady) {
            continue
          }
          const opencodeApi = await import('../api/opencode.js')
          const { generateBranchName, generateCommitMessage, getOpenCodeModels } = opencodeApi
          const models = await getOpenCodeModels()
          const opencodeOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to recovery options', value: 'back' }]
          const chosen = await select('Choose OpenCode Zen model:', opencodeOptions)
          if (chosen === 'back') {
            continue
          }
          aiProvider = 'opencode-zen'
          currentModel = chosen
          updateModel?.('opencode-zen', chosen)
          const spinner = new ScrambleProgress()
          spinner.start([
            `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenCode Zen (${chosen})`,
          ])
          if (isCommit) {
            aiSuffix = await generateCommitMessage(diff, correction, chosen)
          } else {
            aiSuffix = await generateBranchName(diff, correction, chosen)
          }
          spinner.stop()

          break
        }
        // No default
      }

      continue
    }
  }
}

export async function getBranchNameFromDiffUsingProvider(
  provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
  diff: string,
  correction?: string,
  _model?: OpenRouterModel | GeminiModel | string,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel,
  groqModel?: GroqModel,
  codexModel?: string,
  opencodeModel?: string
): Promise<string | null> {
  return generateBranchNameWithProvider(
    provider,
    diff,
    correction,
    _model,
    openrouterModel,
    geminiModel,
    groqModel,
    codexModel,
    opencodeModel
  )
}

/**
 * Ensure provider setup and prompt the user to choose a model for that provider.
 * Returns the chosen model value string or 'back' if the user went back, or undefined if setup failed.
 */
export async function chooseModelForProvider(
  provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
  prompt?: string,
  backLabel?: string
): Promise<string | 'back' | undefined> {
  if (provider === 'openrouter') {
    log.info(`Selected AI Provider: OpenRouter`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider(provider)
    if (!ready) {
      return undefined
    }

    const or = await import('../api/openrouter.js')
    const models = (await or.getOpenRouterModels()) as Array<{ label: string; value: string }>

    // Check if no models are available
    if (models.length === 0) {
      log.warn('No OpenRouter models available.')
      return undefined
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose OpenRouter model:', options)
    return chosen as string | 'back'
  }

  if (provider === 'groq') {
    log.info(`Selected AI Provider: Groq`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider('groq')
    if (!ready) return undefined

    const groqApi = await import('../api/groq.js')
    const models = await groqApi.getGroqModels()

    if (models.length === 0) {
      log.warn('No Groq models available.')
      return undefined
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose Groq model:', options)
    return chosen as string | 'back'
  }

  if (provider === 'codex') {
    log.info(`Selected AI Provider: OpenAI Codex`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider('codex')
    if (!ready) return undefined

    const codexApi = await import('../api/codex.js')
    const models = await codexApi.getCodexModels()

    if (models.length === 0) {
      log.warn('No OpenAI Codex models available.')
      return undefined
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose OpenAI Codex model:', options)
    return chosen as string | 'back'
  }

  if (provider === 'opencode-zen') {
    log.info(`Selected AI Provider: OpenCode Zen`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider('opencode-zen')
    if (!ready) return undefined

    const opencodeApi = await import('../api/opencode.js')
    const models = await opencodeApi.getOpenCodeModels()
    if (models.length === 0) {
      log.warn('No OpenCode Zen models available. Configure OpenCode Zen first.')
      return undefined
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose OpenCode Zen model:', options)
    return chosen as string | 'back'
  }

  // Gemini
  log.info(`Selected AI Provider: Gemini`)

  const { ensureAIProvider } = await import('../core/setup.js')
  const ready = await ensureAIProvider(provider)
  if (!ready) {
    return undefined
  }

  const gm = await import('../api/gemini.js')
  const models = (await gm.getGeminiModels()) as Array<{ label: string; value: string }>

  // Check if no models are available
  if (models.length === 0) {
    log.warn('No Gemini models available.')
    return undefined
  }

  const options = models.some((m) => m.value === 'back')
    ? models
    : [...models, { label: backLabel ?? 'Back', value: 'back' }]
  const { select } = await import('../cli/menu.js')
  const chosen = await select(prompt ?? 'Choose Gemini model:', options)
  return chosen as string | 'back'
}
