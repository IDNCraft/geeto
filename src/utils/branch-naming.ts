import type { GeminiModel } from '../api/gemini.js'
import type { GroqModel } from '../api/groq.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { execFile, execGit } from './exec.js'
import { getChangedFiles, getChangedFilesWithStatus } from './git.js'
import { ScrambleProgress } from './scramble.js'

export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}

export const handleBranchNaming = async (
  defaultPrefix: string,
  separator: '-' | '_',
  trelloCardId: string,
  currentBranch: string,
  aiProvider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen' = 'gemini',
  model?: OpenRouterModel | GeminiModel | GroqModel | string,
  updateModel?: (
    provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
    model?: OpenRouterModel | GeminiModel | GroqModel | string
  ) => void
): Promise<BranchNamingResult> => {
  const { askQuestion } = await import('../cli/input.js')
  const { select } = await import('../cli/menu.js')
  const { exec } = await import('./exec.js')
  const { log } = await import('./logging.js')
  const { colors } = await import('./colors.js')

  const result: BranchNamingResult = {
    workingBranch: '',
    shouldRestart: false,
    cancelled: false,
  }

  let diff = execGit('git diff --cached', true)
  // If there are no staged changes, offer to stage
  if (!diff?.trim()) {
    const changedFiles = getChangedFiles()
    if (changedFiles.length === 0) {
      log.warn('No changes found. Cannot generate a branch name. Aborting.')
      result.cancelled = true
      return result
    }

    const { displayChangedFiles } = await import('./display.js')
    log.info(`Changed files: ${changedFiles.length}`)
    console.log('')
    displayChangedFiles(getChangedFilesWithStatus())

    const stageChoice = (await select('Before generating a branch name, choose staged changes:', [
      { label: 'Stage all current changes', value: 'all' },
      { label: 'Use changes already staged', value: 'skip' },
      { label: 'Cancel branch-name generation', value: 'cancel' },
    ])) as 'all' | 'skip' | 'cancel'

    switch (stageChoice) {
      case 'all': {
        exec('git add -A')
        log.success('All changes staged')
        console.log('')

        diff = execGit('git diff --cached', true)
        if (!diff?.trim()) {
          log.error('Still no staged changes after staging. Aborting.')
          result.cancelled = true
          return result
        }
        break
      }
      case 'cancel': {
        log.warn('Cancelled.')
        result.cancelled = true
        return result
      }
      case 'skip': {
        // Re-check if there are actually staged changes
        diff = execGit('git diff --cached', true)
        if (!diff?.trim()) {
          log.error('No staged changes found. Aborting.')
          result.cancelled = true
          return result
        }
        break
      }
    }
  }
  let correction = ''
  let aiSuffix: string | null = null
  let skipRegenerate = false

  // Loop until branch name accepted
  while (true) {
    const {
      getModelDisplayName,
      getAIProviderShortName,
      interactiveAIFallback,
      isTransientAIFailure,
      isContextLimitFailure,
      chooseModelForProvider,
    } = await import('./git-ai.js')

    const modelDisplay = getModelDisplayName(aiProvider, model)

    // Separate this AI generation log from prior output so it stands alone
    if (correction) {
      console.log('')
    }

    // Only call provider to regenerate when not skipping (e.g., user selected Back)
    if (skipRegenerate) {
      // consume the skip once - will reuse existing aiSuffix
      skipRegenerate = false
    } else {
      const spinner = new ScrambleProgress()
      spinner.start([
        `Analyzing changes with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}`,
      ])
      aiSuffix = null
      try {
        switch (aiProvider) {
          case 'gemini': {
            const { generateBranchName } = await import('../api/gemini.js')
            const word = diff
            aiSuffix = await generateBranchName(word, correction, model as GeminiModel)
            break
          }
          case 'openrouter': {
            const { generateBranchName } = await import('../api/openrouter.js')
            const word = diff
            aiSuffix = await generateBranchName(word, correction, model as OpenRouterModel)
            break
          }
          case 'groq': {
            const { generateBranchName } = await import('../api/groq.js')
            aiSuffix = await generateBranchName(diff, correction, model as string)
            break
          }
          case 'codex': {
            const { generateBranchName } = await import('../api/codex.js')
            aiSuffix = await generateBranchName(diff, correction, model as string)
            break
          }
          case 'opencode-zen': {
            const { generateBranchName } = await import('../api/opencode.js')
            aiSuffix = await generateBranchName(diff, correction, model as string)
            break
          }
        }
        spinner.stop()
      } catch (error) {
        spinner.stop()
        throw error
      }
    }

    if (!aiSuffix || isTransientAIFailure(aiSuffix) || isContextLimitFailure(aiSuffix)) {
      const safeUpdate = (
        provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
        modelStr?: string
      ) => {
        if (updateModel) {
          // forward to provided updater (cast since caller may use narrower model types)
          updateModel(provider, modelStr as unknown as OpenRouterModel | GeminiModel)
        }
      }

      aiSuffix = await interactiveAIFallback(
        aiSuffix,
        aiProvider ?? 'gemini',
        model as OpenRouterModel | GeminiModel,
        diff,
        correction,
        currentBranch,
        safeUpdate
      )

      if (aiSuffix === null) {
        const { getBranchPrefix, validateBranchName } = await import('./git.js')
        const customPrefix = getBranchPrefix(currentBranch)
        let valid = false
        while (!valid) {
          result.workingBranch = askQuestion('Enter branch name:', `${customPrefix}new-feature`)
          const validation = validateBranchName(result.workingBranch)
          if (validation.valid) {
            valid = true
          } else {
            log.error(`Invalid branch name: ${validation.reason}`)
          }
        }
        break
      }
    }

    const cleanSuffix = aiSuffix
      .toLowerCase()
      .replaceAll(/\W+/g, separator)
      .replace(separator === '-' ? /-+/g : /_+/g, separator)
      .replace(separator === '-' ? /^-|-$/g : /^_|_$/g, '')
      .trim()

    const incompletePatterns =
      separator === '-'
        ? ['-and', '-or', '-with', '-for', '-the', '-a', '-an', '-in', '-on', '-at', '-to', '-of']
        : ['_and', '_or', '_with', '_for', '_the', '_a', '_an', '_in', '_on', '_at', '_to', '_of']
    // Treat trailing prepositions as incomplete
    const extraIncomplete =
      separator === '-'
        ? ['-from', '-via', '-using', '-per', '-by']
        : ['_from', '_via', '_using', '_per', '_by']
    incompletePatterns.push(...extraIncomplete)
    const seemsIncomplete = incompletePatterns.some((pattern) => cleanSuffix.endsWith(pattern))

    if (seemsIncomplete) {
      log.warn(
        `AI response seems incomplete (ends with "${cleanSuffix.slice(-4)}"), regenerating...`
      )
      correction = 'Generate a complete branch name without truncation'
      continue
    }

    const currentSuggestion = trelloCardId
      ? `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
      : `${defaultPrefix}${cleanSuffix}`

    const contextLimitDetected = isContextLimitFailure(aiSuffix)

    if (!contextLimitDetected) {
      log.ai(`Suggested: ${colors.cyan}${colors.bright}${currentSuggestion}${colors.reset}`)
    }

    if (contextLimitDetected) {
      // Force user to change model/provider or edit manually; don't allow accepting this suggestion
      const acceptAi = await select(
        'This model cannot process the input due to token/context limits. Please choose a different model or provider:',
        [
          {
            label: `Try again with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''} model`,
            value: 'try-same',
          },
          { label: 'Choose another model', value: 'change-model' },
          { label: 'Choose another AI provider', value: 'change-provider' },
          { label: 'Enter the branch name manually', value: 'edit' },
          { label: 'Back to branch menu', value: 'back' },
        ]
      )

      switch (acceptAi) {
        case 'try-same': {
          // Attempt to retry generation with the same provider/model
          correction = ''
          continue
        }
        case 'change-model': {
          // change only the current provider's model — use centralized helper
          const provKey = (aiProvider ?? 'gemini') as
            | 'gemini'
            | 'openrouter'
            | 'groq'
            | 'codex'
            | 'opencode-zen'
            | string
          const provider = (provKey === 'manual' ? 'gemini' : provKey) as
            | 'gemini'
            | 'openrouter'
            | 'groq'
            | 'codex'
            | 'opencode-zen'
          const chosen = await chooseModelForProvider(
            provider,
            'Choose model:',
            'Back to suggested branch selection'
          )
          if (!chosen) {
            skipRegenerate = true
            continue
          }
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          updateModel?.(provider, chosen as unknown as OpenRouterModel | GeminiModel)
          model = chosen as unknown as OpenRouterModel | GeminiModel
          correction = ''
          continue
        }
        case 'change-provider': {
          const prov = await select('Choose AI provider:', [
            { label: 'Gemini', value: 'gemini' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Groq', value: 'groq' },
            { label: 'OpenAI Codex', value: 'codex' },
            { label: 'OpenCode Zen', value: 'opencode-zen' },
            { label: 'Back to suggested branch selection', value: 'cancel-prov' },
          ])
          if (prov === 'cancel-prov') {
            // User chose the contextual "Back" option — don't regenerate, return to previous menu
            skipRegenerate = true
            continue
          }
          // Centralized provider/model selection helper
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
            'Choose model:',
            'Back to suggested branch selection'
          )
          if (!chosen) {
            skipRegenerate = true
            continue
          }
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          switch (prov) {
            case 'openrouter': {
              updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
              aiProvider = 'openrouter'
              model = chosen as unknown as OpenRouterModel
              break
            }
            case 'groq': {
              updateModel?.('groq', chosen)
              aiProvider = 'groq'
              model = chosen
              break
            }
            case 'codex': {
              updateModel?.('codex', chosen)
              aiProvider = 'codex'
              model = chosen
              break
            }
            case 'opencode-zen': {
              updateModel?.('opencode-zen', chosen)
              aiProvider = 'opencode-zen'
              model = chosen
              break
            }
            default: {
              updateModel?.('gemini', chosen as unknown as GeminiModel)
              aiProvider = 'gemini'
              model = chosen as unknown as GeminiModel
              break
            }
          }
          correction = ''
          continue
        }
        case 'edit': {
          const edited = askQuestion(`Edit branch (${currentSuggestion}): `)
          result.workingBranch = edited ?? currentSuggestion
          break
        }
        case 'back': {
          result.shouldRestart = true
          break
        }
      }
    } else {
      const acceptAi = await select('Choose what to do with this branch name:', [
        { label: 'Use this branch name', value: 'accept' },
        { label: 'Generate a new branch name', value: 'regenerate' },
        { label: 'Give AI feedback', value: 'correct' },
        { label: 'Choose another model', value: 'change-model' },
        { label: 'Choose another AI provider', value: 'change-provider' },
        { label: 'Edit branch name manually', value: 'edit' },
        { label: 'Return to branch menu', value: 'back' },
      ])

      switch (acceptAi) {
        case 'accept': {
          const { branchExists } = await import('./git.js')
          if (branchExists(currentSuggestion)) {
            log.error(`Branch '${currentSuggestion}' already exists locally`)
            skipRegenerate = true
            continue
          }
          result.workingBranch = currentSuggestion
          break
        }
        case 'regenerate': {
          correction = ''
          continue
        }
        case 'correct': {
          correction = askQuestion(
            'Provide corrections for the AI (e.g., prefer kebab-case, shorten subject): '
          )
          continue
        }
        case 'change-model': {
          // change only the current provider's model
          const currentProv = aiProvider ?? 'gemini'
          switch (currentProv) {
            case 'openrouter': {
              const or = await import('../api/openrouter.js')
              const models = await or.getOpenRouterModels()
              const orOptions = models.some((m) => m.value === 'back')
                ? models
                : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
              const chosen = await select('Choose OpenRouter model:', orOptions)
              if (chosen === 'back') {
                skipRegenerate = true
                continue
              }
              updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
              model = chosen as unknown as OpenRouterModel

              break
            }
            case 'groq': {
              const groq = await import('../api/groq.js')
              const models = await groq.getGroqModels()
              const groqOptions = models.some((m) => m.value === 'back')
                ? models
                : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
              const chosen = await select('Choose Groq model:', groqOptions)
              if (chosen === 'back') {
                skipRegenerate = true
                continue
              }
              updateModel?.('groq', chosen)
              model = chosen

              break
            }
            default: {
              const gm = await import('../api/gemini.js')
              const models = await gm.getGeminiModels()
              const gmOptions = models.some((m) => m.value === 'back')
                ? models
                : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
              const chosen = await select('Choose Gemini model:', gmOptions)
              if (chosen === 'back') {
                skipRegenerate = true
                continue
              }
              updateModel?.('gemini', chosen as unknown as GeminiModel)
              model = chosen as unknown as GeminiModel
            }
          }
          correction = ''
          continue
        }
        case 'change-provider': {
          const prov = await select('Choose AI provider:', [
            { label: 'Gemini', value: 'gemini' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Groq', value: 'groq' },
            { label: 'OpenAI Codex', value: 'codex' },
            { label: 'OpenCode Zen', value: 'opencode-zen' },
            { label: 'Back to suggested branch selection', value: 'cancel-prov' },
          ])
          if (prov === 'cancel-prov') {
            // User chose the contextual "Back" option — don't regenerate, return to previous menu
            skipRegenerate = true
            continue
          }

          // Centralized provider/model selection helper
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
            'Choose model:',
            'Back to suggested branch selection'
          )
          if (!chosen) {
            skipRegenerate = true
            continue
          }
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          switch (prov) {
            case 'openrouter': {
              updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
              aiProvider = 'openrouter'
              model = chosen as unknown as OpenRouterModel
              break
            }
            case 'groq': {
              updateModel?.('groq', chosen)
              aiProvider = 'groq'
              model = chosen
              break
            }
            case 'codex': {
              updateModel?.('codex', chosen)
              aiProvider = 'codex'
              model = chosen
              break
            }
            case 'opencode-zen': {
              updateModel?.('opencode-zen', chosen)
              aiProvider = 'opencode-zen'
              model = chosen
              break
            }
            default: {
              updateModel?.('gemini', chosen as unknown as GeminiModel)
              aiProvider = 'gemini'
              model = chosen as unknown as GeminiModel
              break
            }
          }
          correction = ''
          continue
        }
        case 'edit': {
          const edited = askQuestion(`Edit branch (${currentSuggestion}): `)
          result.workingBranch = edited || currentSuggestion
          break
        }
        case 'back': {
          result.shouldRestart = true
          break
        }
      }
    }

    if (result.workingBranch || result.shouldRestart) {
      break
    }
  }

  if (result.workingBranch && result.workingBranch !== currentBranch) {
    const { validateBranchName } = await import('./git.js')
    const validation = validateBranchName(result.workingBranch)
    if (!validation.valid) {
      log.error(`Invalid branch name: ${validation.reason}`)
      result.workingBranch = ''
      return result
    }

    const { branchExists } = await import('./git.js')
    if (branchExists(result.workingBranch)) {
      log.error(`Branch '${result.workingBranch}' already exists locally`)
      result.workingBranch = ''
      return result
    }

    const spinner = log.spinner()
    spinner.start(`Creating branch: ${result.workingBranch}...`)
    execFile('git', ['checkout', '-b', result.workingBranch], true)
    spinner.succeed(`Branch created: ${result.workingBranch}`)
  }

  return result
}

// ── Issue ID extraction & project linking ──────────────────────────

/**
 * Extract Trello card shortLink from a branch name.
 * Branch format: {prefix}{shortLink}{separator}{slug}
 * e.g. "dev/abc123XY-add-login-page" → "abc123XY"
 *
 * Also works with merge commit subjects like:
 * "Merge branch 'dev/abc123XY-add-login-page'"
 */
export const extractCardIdFromBranch = (
  branchOrSubject: string,
  separator: '-' | '_' = '-'
): string | null => {
  let branch = branchOrSubject

  // Extract branch name from merge commit subjects
  const mergeMatch = branch.match(/Merge\s+branch\s+'([^']+)'/)
  if (mergeMatch?.[1]) branch = mergeMatch[1]

  // Also handle "Merge pull request #N from org/branch"
  const prMatch = branch.match(/from\s+\S+\/(.+)$/)
  if (prMatch?.[1]) branch = prMatch[1]

  // Strip prefix (everything up to and including last '/')
  const slashIdx = branch.lastIndexOf('/')
  const suffix = slashIdx === -1 ? branch : branch.slice(slashIdx + 1)

  // Trello shortLink is 8 alphanumeric chars at the start, followed by separator
  const cardRegex = separator === '-' ? /^([a-zA-Z0-9]{8})-/ : /^([a-zA-Z0-9]{8})_/
  const cardMatch = suffix.match(cardRegex)
  if (cardMatch?.[1]) return cardMatch[1]

  return null
}

/**
 * Build a project management URL from a card/issue ID.
 * Currently supports: Trello (via shortLink)
 * Future: Jira ({baseUrl}/browse/{key}), Linear, Asana, etc.
 */
export const buildProjectLink = (cardId: string, tool: 'trello' | 'none'): string | null => {
  switch (tool) {
    case 'trello': {
      return `https://trello.com/c/${cardId}`
    }
    case 'none': {
      return null
    }
    default: {
      return null
    }
  }
}

export default handleBranchNaming
