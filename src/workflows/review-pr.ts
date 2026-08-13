/**
 * AI-powered Pull Request / Merge Request review workflow
 */

import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { getPlatformAPI } from '../api/platform.js'
import { select } from '../cli/menu.js'
import {
  getConfiguredAIProvider,
  getModelForProvider,
  updateModelInState,
} from '../utils/ai-workflow.js'
import { colors } from '../utils/colors.js'
import {
  generateTextWithProvider,
  getAIProviderShortName,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git-ai.js'
import { getPlatformRepoFromRemote, validatePlatformConfig } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { loadPrompt } from '../utils/prompt-loader.js'
import { loadState, saveState } from '../utils/state.js'

/**
 * Generate PR review using AI
 */
const callAIForReview = async (
  diff: string,
  provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
  model: string | undefined,
  author: string,
  correction?: string
): Promise<string | null> => {
  const promptBase = [
    loadPrompt('review-prompt.md'),
    '',
    `Author: @${author}`,
    `Diff:\n${diff}`,
  ].join('\n')
  const prompt = correction ? `${promptBase}\n\nAdjustment: ${correction}` : promptBase

  const providerName = getAIProviderShortName(provider)
  const modelDisplay = model ? ` (${model})` : ''

  const spinner = log.spinner()
  spinner.start(`Analyzing PR with ${providerName}${modelDisplay}...`)

  try {
    const result = await generateTextWithProvider(
      provider,
      prompt,
      undefined,
      model as OpenRouterModel,
      (model as GeminiModel) ?? 'gemini-2.5-flash',
      model,
      model,
      model
    )
    spinner.stop()
    return result
  } catch {
    spinner.fail('AI analysis failed')
    return null
  }
}

/**
 * Interactive Review PR workflow
 */
export const handleReviewPR = async (): Promise<void> => {
  log.banner()

  const platformRepo = getPlatformRepoFromRemote()
  if (!platformRepo) return
  if (!validatePlatformConfig(platformRepo.platform)) return
  const api = getPlatformAPI(platformRepo.platform)

  const prLabel = platformRepo.platform === 'gitlab' ? 'MR' : 'PR'
  const prLabelFull = platformRepo.platform === 'gitlab' ? 'Merge Request' : 'Pull Request'

  log.step(`${colors.cyan}AI ${prLabelFull} Review${colors.reset}\n`)

  const spinner = log.spinner()
  spinner.start(`Fetching open ${prLabel}s...`)
  const openPRs = await api.listPRs(
    platformRepo.projectPath,
    undefined,
    platformRepo.owner,
    platformRepo.repo
  )
  spinner.stop()

  if (openPRs.length === 0) {
    log.warn(`No open ${prLabel}s found in this repository.`)
    return
  }

  const prOptions = openPRs.map((pr) => ({
    label: `#${pr.number} ${pr.title} (${colors.gray}by @${pr.author}${colors.reset})`,
    value: String(pr.number),
  }))

  const selectedPRValue = await select(`Select a ${prLabel} to review:`, prOptions)
  if (!selectedPRValue) return

  const selectedPRNumber = Number.parseInt(selectedPRValue, 10)
  const selectedPR = openPRs.find((pr) => pr.number === selectedPRNumber)
  if (!selectedPR) return

  spinner.start(`Downloading diff for ${prLabel} #${selectedPRNumber}...`)
  const diff = await api.getPRDiff(
    platformRepo.projectPath,
    selectedPRNumber,
    platformRepo.owner,
    platformRepo.repo
  )
  spinner.stop()

  if (!diff) {
    log.error(`Could not download diff for ${prLabel} #${selectedPRNumber}.`)
    return
  }

  const state = loadState()
  let aiProvider = getConfiguredAIProvider(state)

  if (!aiProvider) {
    log.error('AI provider is not configured. Run `gt --settings` to setup AI.')
    return
  }

  let currentModel = getModelForProvider(aiProvider, state)
  let aiDone = false
  let reviewText = ''
  let correction = ''

  while (!aiDone) {
    const result = await callAIForReview(
      diff,
      aiProvider,
      currentModel,
      selectedPR.author,
      correction
    )
    const failed = !result || isTransientAIFailure(result) || isContextLimitFailure(result)

    if (failed) {
      log.warn('AI analysis failed or hit context limits.')
      const failureAction = await select(
        'Pull request review failed. Choose a different model/provider to retry, or cancel:',
        [
          { label: 'Change model and retry', value: 'change-model' },
          { label: 'Change AI provider and retry', value: 'change-provider' },
          { label: 'Cancel pull request review', value: 'cancel' },
        ]
      )

      if (failureAction === 'change-model') {
        const { chooseModelForProvider } = await import('../utils/git-ai.js')
        const chosen = await chooseModelForProvider(
          aiProvider,
          'Choose model:',
          'Keep current model'
        )
        if (chosen && chosen !== 'back') {
          currentModel = chosen
          updateModelInState(state, aiProvider, chosen)
        }
        correction = ''
        continue
      }

      if (failureAction === 'change-provider') {
        const prov = await select('Choose AI provider:', [
          { label: 'Gemini', value: 'gemini' },
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'Groq', value: 'groq' },
          { label: 'OpenAI Codex', value: 'codex' },
          { label: 'OpenCode Zen', value: 'opencode-zen' },
          { label: 'Keep current provider', value: 'back' },
        ])
        if (prov !== 'back') {
          const { chooseModelForProvider } = await import('../utils/git-ai.js')
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
            'Choose model:',
            'Keep current model'
          )
          if (chosen && chosen !== 'back') {
            aiProvider = prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen'
            currentModel = chosen
            if (state) {
              state.aiProvider = aiProvider
              updateModelInState(state, aiProvider, chosen)
              saveState(state)
            }
          }
        }
        correction = ''
        continue
      }

      return
    }

    reviewText = result ?? ''

    console.log('')
    console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset} ${colors.bright}AI Review Findings${colors.reset}`)
    console.log(`${colors.cyan}├──────────────────────────────────────────────┤${colors.reset}`)
    const lines = reviewText.split('\n')
    for (const line of lines) {
      console.log(`${colors.cyan}│${colors.reset} ${line}`)
    }
    console.log(`${colors.cyan}└──────────────────────────────────────────────┘${colors.reset}`)
    console.log('')

    const action = await select(`Choose what to do with this ${prLabel} review:`, [
      { label: `Post this ${prLabel} review`, value: 'accept' },
      { label: 'Generate a new review', value: 'regenerate' },
      { label: 'Give AI feedback', value: 'correct' },
      { label: 'Switch model', value: 'change-model' },
      { label: 'Switch AI provider', value: 'change-provider' },
      { label: 'Discard the review', value: 'discard' },
    ])

    switch (action) {
      case 'accept': {
        aiDone = true
        break
      }
      case 'regenerate': {
        correction = ''
        continue
      }
      case 'correct': {
        const { askQuestion } = await import('../cli/input.js')
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        correction = askQuestion('Corrections for AI: ')
        continue
      }
      case 'change-model': {
        const { chooseModelForProvider } = await import('../utils/git-ai.js')
        const chosen = await chooseModelForProvider(
          aiProvider,
          'Choose model:',
          'Keep current model'
        )
        if (chosen && chosen !== 'back') {
          currentModel = chosen
          updateModelInState(state, aiProvider, chosen)
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
          { label: 'Keep current provider', value: 'back' },
        ])
        if (prov !== 'back') {
          const { chooseModelForProvider } = await import('../utils/git-ai.js')
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
            'Choose model:',
            'Keep current model'
          )
          if (chosen && chosen !== 'back') {
            aiProvider = prov as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen'
            currentModel = chosen
            if (state) {
              state.aiProvider = aiProvider
              updateModelInState(state, aiProvider, chosen)
            }
          }
        }
        correction = ''
        continue
      }
      default: {
        log.info('Review analysis discarded.')
        return
      }
    }
  }

  spinner.start(`Posting review comment...`)
  const success = await api.createPRComment(
    platformRepo.projectPath,
    selectedPRNumber,
    reviewText,
    platformRepo.owner,
    platformRepo.repo
  )

  if (success) {
    spinner.succeed(`Review comment successfully posted!`)
    console.log(`  ${colors.cyan}${selectedPR.url}${colors.reset}\n`)
  } else {
    spinner.fail(`Failed to post review comment.`)
  }
}
