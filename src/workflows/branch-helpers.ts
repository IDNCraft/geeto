import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { BranchStrategyConfig, GeetoState } from '../types/index.js'

import { createBranch, promptManualBranch } from './branch-utils.js'
import {
  fetchTrelloCards,
  fetchTrelloLists,
  generateBranchNameFromTrelloTitle,
} from '../api/trello.js'
import { askQuestion } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP } from '../core/constants.js'
import { getConfiguredAIProvider } from '../utils/ai-workflow.js'
import { colors } from '../utils/colors.js'
import {
  DEFAULT_GEMINI_MODEL,
  getBranchStrategyConfig,
  hasTrelloConfig,
  saveBranchStrategyConfig,
} from '../utils/config.js'
import { chooseModelForProvider } from '../utils/git-ai.js'
import {
  generateBranchNameWithProvider,
  getAIProviderShortName,
  getModelDisplayName,
  interactiveAIFallback,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git.js'
import { log } from '../utils/logging.js'
import { saveState } from '../utils/state.js'

export interface TrelloCaseResult {
  workingBranch?: string
  selectedNamingStrategy?: 'title-full' | 'title-ai' | 'ai' | 'manual'
  branchFlowComplete: boolean
  branchMenuShown: boolean
}

export async function handleTrelloCase(
  state: GeetoState,
  branchConfig: BranchStrategyConfig | null,
  separator: '-' | '_',
  defaultPrefix: string
): Promise<TrelloCaseResult> {
  // Returns result explaining what to do next for the branch workflow
  if (!hasTrelloConfig()) {
    const { hasSkippedTrelloPrompt } = await import('../utils/config.js')
    if (hasSkippedTrelloPrompt()) {
      return { branchFlowComplete: false, branchMenuShown: false }
    }
    const spinner = log.spinner()
    spinner.start('Setting up Trello integration...')
    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const setupSuccess = setupTrelloConfigInteractive()
    spinner.stop()
    if (!setupSuccess) {
      log.warn('Trello setup was not completed. Run `geeto --setup-trello` to try again.')
      return { branchFlowComplete: false, branchMenuShown: false }
    }
    log.success('Trello integration configured!')
  }

  const spinner = log.spinner()
  spinner.start('Checking Trello for tasks...')

  const trelloLists = await fetchTrelloLists()
  spinner.stop()
  if (trelloLists.length === 0) {
    log.warn('No Trello lists found on board')
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // List selection
  const lastUsedListId = branchConfig?.lastTrelloList as string | undefined
  const listOptions = [
    ...trelloLists.map((list) => ({
      label: list.id === lastUsedListId ? `${list.name} ⭐ Last used` : `${list.name}`,
      value: list.id,
    })),
    { label: 'All lists (no filter)', value: 'all' },
    { label: 'Back to branch menu', value: 'back-menu' },
  ]

  const selectedListId = await select('Select Trello list:', listOptions)
  if (selectedListId === 'back-menu') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  if (selectedListId !== 'all') {
    const currentStrategy = getBranchStrategyConfig()
    saveBranchStrategyConfig({
      separator,
      lastNamingStrategy: currentStrategy?.lastNamingStrategy,
      lastTrelloList: selectedListId,
    })
  }

  const filterListId = selectedListId === 'all' ? undefined : selectedListId
  const cardSpinner = log.spinner()
  cardSpinner.start('Loading Trello cards...')
  const trelloCards = await fetchTrelloCards(filterListId)
  cardSpinner.stop()

  if (trelloCards.length === 0) {
    log.warn(
      'No cards found in the selected Trello list. Add a card or choose another list, then try again.'
    )
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // Card selection and naming
  const trelloOptions = [
    ...trelloCards.slice(0, 15).map((card) => {
      const branchPreview = generateBranchNameFromTrelloTitle(card.name, card.shortLink, separator)
      return {
        label: `${defaultPrefix}${branchPreview}`,
        value: JSON.stringify({ id: card.shortLink, title: card.name }),
      }
    }),
    { label: 'Back to branch menu', value: 'back-menu' },
  ]

  const selectedCard = await select('Select Trello card:', trelloOptions)
  if (selectedCard === 'back-menu') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  const cardData = JSON.parse(selectedCard) as { id: string; title: string }
  const trelloCardId = cardData.id
  log.success(`Linked to Trello card ${trelloCardId}`)

  // Naming strategy selection for the card
  const namingChoice = await select('Choose how to build the branch name:', [
    { label: 'Use Trello title (full)', value: 'title-full' },
    { label: 'Use Trello title (AI shortened)', value: 'title-ai' },
    { label: 'Use Trello title (AI shortened + English)', value: 'title-ai-en' },
    { label: 'Back to card selection', value: 'back' },
  ])

  if (namingChoice === 'back') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  if (namingChoice === 'title-full') {
    const branchSuffix = generateBranchNameFromTrelloTitle(cardData.title, cardData.id, separator)
    const workingBranch = `${defaultPrefix}${branchSuffix}`
    log.success(`Branch name: ${colors.cyan}${workingBranch}${colors.reset}`)
    if (await createBranch(workingBranch, state.currentBranch)) {
      state.workingBranch = workingBranch
      state.step = STEP.BRANCH_CREATED
      saveState(state)
      return {
        workingBranch,
        selectedNamingStrategy: 'title-full',
        branchFlowComplete: true,
        branchMenuShown: true,
      }
    }

    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // title-ai or title-ai-en: use AI to shorten Trello title (optionally translate to English first)
  const shouldTranslateToEnglish = namingChoice === 'title-ai-en'

  // First, ensure AI provider is configured
  if (!getConfiguredAIProvider(state)) {
    log.warn('No AI provider configured yet.')
    const providerChoice = await select('Choose AI provider:', [
      { label: 'Gemini', value: 'gemini' },
      { label: 'OpenRouter', value: 'openrouter' },
      { label: 'Groq', value: 'groq' },
      { label: 'OpenAI Codex', value: 'codex' },
      { label: 'OpenCode Zen', value: 'opencode-zen' },
      { label: 'Back to naming strategy', value: 'back' },
    ])

    if (providerChoice === 'back') {
      return { branchFlowComplete: false, branchMenuShown: false }
    }

    const chosenProvider = providerChoice as
      | 'gemini'
      | 'openrouter'
      | 'groq'
      | 'codex'
      | 'opencode-zen'

    // Let user choose model for the selected provider
    const chosenModel = await chooseModelForProvider(
      chosenProvider,
      'Choose model:',
      'Back to provider selection'
    )

    if (!chosenModel || chosenModel === 'back') {
      return { branchFlowComplete: false, branchMenuShown: false }
    }

    // Save selected provider and model to state
    state.aiProvider = chosenProvider
    switch (chosenProvider) {
      case 'openrouter': {
        state.openrouterModel = chosenModel as OpenRouterModel
        break
      }
      case 'groq': {
        state.groqModel = chosenModel
        break
      }
      case 'codex': {
        state.codexModel = chosenModel
        break
      }
      case 'opencode-zen': {
        state.opencodeModel = chosenModel
        break
      }
      default: {
        state.geminiModel = chosenModel as GeminiModel
        break
      }
    }
    saveState(state)
    log.success(`AI provider set to ${getAIProviderShortName(chosenProvider)}`)
  }

  let correction = ''
  let aiSuffix: string | null = null
  let skipRegenerate = false

  while (true) {
    const aiProvider = getConfiguredAIProvider(state)
    if (!aiProvider) {
      log.warn('No AI provider configured. Please choose a provider first.')
      return { branchFlowComplete: false, branchMenuShown: false }
    }
    let modelParam: OpenRouterModel | GeminiModel | string
    switch (aiProvider) {
      case 'openrouter': {
        modelParam = state.openrouterModel as OpenRouterModel
        break
      }
      case 'groq': {
        modelParam = state.groqModel ?? ''
        break
      }
      case 'codex': {
        modelParam = state.codexModel ?? ''
        break
      }
      case 'opencode-zen': {
        modelParam = state.opencodeModel ?? ''
        break
      }
      default: {
        modelParam = (state.geminiModel ?? DEFAULT_GEMINI_MODEL) as GeminiModel
        break
      }
    }

    let model: string | undefined
    switch (aiProvider) {
      case 'openrouter': {
        model = state.openrouterModel as unknown as string
        break
      }
      case 'groq': {
        model = state.groqModel ?? undefined
        break
      }
      case 'codex': {
        model = state.codexModel
        break
      }
      case 'opencode-zen': {
        model = state.opencodeModel
        break
      }
      default: {
        model = (state.geminiModel as unknown as string) ?? DEFAULT_GEMINI_MODEL
        break
      }
    }
    const modelDisplay = getModelDisplayName(aiProvider, model)
    const spinner = log.spinner()

    let titleToProcess = cardData.title

    // Step 1: Translate to English if requested
    if (shouldTranslateToEnglish && !skipRegenerate) {
      spinner.start(
        `Translating to English using ${getAIProviderShortName(aiProvider)}${
          modelDisplay ? ` (${modelDisplay})` : ''
        }...`
      )

      const translatedTitle = await generateBranchNameWithProvider(
        aiProvider,
        `Translate this to English (keep it concise): "${cardData.title}"`,
        '',
        undefined,
        state.openrouterModel,
        state.geminiModel,
        state.groqModel,
        state.codexModel,
        state.opencodeModel
      )

      // Stop spinner first to ensure error messages appear on new line
      spinner.stop()

      if (
        translatedTitle &&
        !isTransientAIFailure(translatedTitle) &&
        !isContextLimitFailure(translatedTitle)
      ) {
        titleToProcess = translatedTitle
        log.info(`Translated: ${colors.cyan}${titleToProcess}${colors.reset}`)
      } else {
        if (!translatedTitle || translatedTitle.includes('Execution failed')) {
          log.warn('Translation unavailable, using original title')
        } else {
          log.warn('Translation failed, using original title')
        }
      }
    }

    // Step 2: Generate short branch name
    spinner.start(
      `Generating short branch name using ${getAIProviderShortName(aiProvider)}${
        modelDisplay ? ` (${modelDisplay})` : ''
      }...`
    )

    if (skipRegenerate) {
      // consume skip once and reuse previous aiSuffix
      skipRegenerate = false
      spinner.stop()
    } else {
      aiSuffix = await generateBranchNameWithProvider(
        aiProvider,
        titleToProcess,
        correction,
        undefined,
        state.openrouterModel,
        state.geminiModel,
        state.groqModel,
        state.codexModel,
        state.opencodeModel
      )
      spinner.stop()
    }

    if (!aiSuffix || isTransientAIFailure(aiSuffix) || isContextLimitFailure(aiSuffix)) {
      aiSuffix = await interactiveAIFallback(
        aiSuffix,
        aiProvider,
        modelParam,
        cardData.title,
        correction,
        state.currentBranch,
        (
          provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
          selectedModel?: string
        ) => {
          state.aiProvider = provider
          switch (provider) {
            case 'openrouter': {
              state.openrouterModel = selectedModel as OpenRouterModel
              state.codexModel = undefined
              break
            }
            case 'groq': {
              state.groqModel = selectedModel
              state.codexModel = undefined
              break
            }
            case 'codex': {
              state.codexModel = selectedModel
              break
            }
            case 'opencode-zen': {
              state.opencodeModel = selectedModel
              break
            }
            default: {
              state.geminiModel = selectedModel as GeminiModel
              state.codexModel = undefined
              break
            }
          }
          saveState(state)
        }
      )
    }

    let workingBranch = ''

    if (aiSuffix === null) {
      workingBranch = promptManualBranch(state.currentBranch)
    } else {
      const tmp = aiSuffix
        .replaceAll(/[^A-Za-z0-9]+/g, separator)
        .replaceAll(/[-_]+/g, separator)
        .toLowerCase()

      let cleanSuffix = tmp
      while (cleanSuffix.startsWith(separator)) cleanSuffix = cleanSuffix.slice(separator.length)
      while (cleanSuffix.endsWith(separator)) cleanSuffix = cleanSuffix.slice(0, -separator.length)

      workingBranch = `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
      const contextLimitDetected = isContextLimitFailure(aiSuffix)
      if (!contextLimitDetected) {
        log.ai(`Suggested: ${colors.cyan}${colors.bright}${workingBranch}${colors.reset}`)
        log.info(
          'Incorrect Suggestion? check .geeto/last-ai-suggestion.json (possible AI/context limit).\n'
        )
      }
    }

    const contextLimitDetected = isContextLimitFailure(aiSuffix)

    let acceptChoice: string
    if (contextLimitDetected) {
      acceptChoice = await select(
        'This model cannot process the input due to token/context limits. Please choose a different model or provider:',
        [
          {
            label: `Try again with ${getAIProviderShortName(aiProvider)}${model ? ` (${model})` : ''} model`,
            value: 'try-same',
          },
          { label: 'Choose another model', value: 'change-model' },
          { label: 'Choose another AI provider', value: 'change-provider' },
          { label: 'Enter the branch name manually', value: 'edit' },
          { label: 'Back to card selection', value: 'back' },
        ]
      )
    } else {
      acceptChoice = await select('Choose what to do with this branch name:', [
        { label: 'Use this branch name', value: 'accept' },
        { label: 'Generate a new branch name', value: 'regenerate' },
        { label: 'Give AI feedback', value: 'correct' },
        { label: 'Choose another model', value: 'change-model' },
        { label: 'Choose another AI provider', value: 'change-provider' },
        { label: 'Edit branch name manually', value: 'edit' },
        { label: 'Return to card selection', value: 'back' },
      ])
    }

    switch (acceptChoice) {
      case 'accept': {
        // create branch and return
        if (await createBranch(workingBranch, state.currentBranch)) {
          state.workingBranch = workingBranch
          state.step = STEP.BRANCH_CREATED
          saveState(state)
          return {
            workingBranch,
            selectedNamingStrategy: 'title-ai',
            branchFlowComplete: true,
            branchMenuShown: true,
          }
        }
        // creation failed, return to menus
        return { branchFlowComplete: false, branchMenuShown: false }
      }
      case 'try-same': {
        // User requested re-trying with the same provider/model
        correction = ''
        break
      }
      case 'regenerate': {
        correction = ''
        break
      }
      case 'change-provider': {
        // let user pick another provider and optionally pick a model
        const prov = await select('Choose AI provider:', [
          { label: 'Gemini', value: 'gemini' },
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'Groq', value: 'groq' },
          { label: 'OpenAI Codex', value: 'codex' },
          { label: 'OpenCode Zen', value: 'opencode-zen' },
          { label: 'Back to suggested branch selection', value: 'cancel-prov' },
        ])
        if (prov === 'cancel-prov') {
          // User chose contextual back — don't regenerate AI suggestion
          skipRegenerate = true
          continue
        }
        state.aiProvider = prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen'

        const chosen = await chooseModelForProvider(
          state.aiProvider as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
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
            state.openrouterModel = chosen as unknown as OpenRouterModel
            break
          }
          case 'gemini': {
            state.geminiModel = chosen as unknown as GeminiModel
            break
          }
          case 'groq': {
            state.groqModel = chosen
            break
          }
          case 'codex': {
            state.codexModel = chosen
            break
          }
          case 'opencode-zen': {
            state.opencodeModel = chosen
            break
          }
          default: {
            break
          }
        }
        saveState(state)
        correction = ''
        break
      }
      case 'change-model': {
        // change only the current provider's model
        const currentProv = getConfiguredAIProvider(state) ?? 'gemini'
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
            state.openrouterModel = chosen as unknown as OpenRouterModel

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
            state.groqModel = chosen

            break
          }
          case 'codex': {
            const codex = await import('../api/codex.js')
            const models = await codex.getCodexModels()
            const codexOptions = models.some((m) => m.value === 'back')
              ? models
              : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
            const chosen = await select('Choose Codex model:', codexOptions)
            if (chosen === 'back') {
              skipRegenerate = true
              continue
            }
            state.codexModel = chosen

            break
          }
          case 'opencode-zen': {
            const opencode = await import('../api/opencode.js')
            const models = await opencode.getOpenCodeModels()
            const opencodeOptions = models.some((m) => m.value === 'back')
              ? models
              : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
            const chosen = await select('Choose OpenCode Zen model:', opencodeOptions)
            if (chosen === 'back') {
              skipRegenerate = true
              continue
            }
            state.opencodeModel = chosen

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
            state.geminiModel = chosen as unknown as GeminiModel
          }
        }
        saveState(state)
        correction = ''
        break
      }
      case 'correct': {
        correction = askQuestion(
          'Provide corrections for the AI (e.g., shorten, prefer verb tense): '
        )
        console.log('')
        break
      }
      case 'edit': {
        const edited = askQuestion(`Edit branch (${workingBranch}): `)
        workingBranch = edited || workingBranch
        if (await createBranch(workingBranch, state.currentBranch)) {
          state.workingBranch = workingBranch
          state.step = STEP.BRANCH_CREATED
          saveState(state)
          return {
            workingBranch,
            selectedNamingStrategy: 'title-ai',
            branchFlowComplete: true,
            branchMenuShown: true,
          }
        }
        return { branchFlowComplete: false, branchMenuShown: false }
      }
      case 'back': {
        return { branchFlowComplete: false, branchMenuShown: false }
      }
    }
  }
}
