/**
 * AI-powered Issue review workflow
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
 * Generate Issue review using AI
 */
const callAIForIssueReview = async (
  title: string,
  body: string,
  author: string,
  provider: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
  model: string | undefined,
  correction?: string
): Promise<string | null> => {
  const promptBase = [
    loadPrompt('issue-prompt-review.md'),
    '',
    `Author: @${author}`,
    `Issue Title: ${title}`,
    `Issue Body:\n${body}`,
  ].join('\n')
  const prompt = correction ? `${promptBase}\n\nAdjustment: ${correction}` : promptBase

  const providerName = getAIProviderShortName(provider)
  const modelDisplay = model ? ` (${model})` : ''

  const spinner = log.spinner()
  spinner.start(`Analyzing Issue with ${providerName}${modelDisplay}...`)

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
 * Interactive Review Issue workflow
 */
export const handleReviewIssue = async (): Promise<void> => {
  log.banner()

  const platformRepo = getPlatformRepoFromRemote()
  if (!platformRepo) return
  if (!validatePlatformConfig(platformRepo.platform)) return
  const api = getPlatformAPI(platformRepo.platform)

  const issueLabelFull = platformRepo.platform === 'gitlab' ? 'GitLab Issue' : 'GitHub Issue'

  log.step(`${colors.cyan}AI ${issueLabelFull} Review${colors.reset}\n`)

  const spinner = log.spinner()
  spinner.start(`Fetching open Issues...`)
  const openIssues = await api.listIssues(
    platformRepo.projectPath,
    platformRepo.owner,
    platformRepo.repo
  )
  spinner.stop()

  if (openIssues.length === 0) {
    log.warn(
      'No open issues found in this repository. Create or reopen an issue, then run the issue review workflow again.'
    )
    return
  }

  const issueOptions = openIssues.map((issue) => ({
    label: `#${issue.number} ${issue.title} (${colors.gray}by @${issue.author}${colors.reset})`,
    value: String(issue.number),
  }))

  const selectedIssueValue = await select(`Select an Issue to review:`, issueOptions)
  if (!selectedIssueValue) return

  const selectedIssueNumber = Number.parseInt(selectedIssueValue, 10)
  const selectedIssue = openIssues.find((issue) => issue.number === selectedIssueNumber)
  if (!selectedIssue) return

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
    const result = await callAIForIssueReview(
      selectedIssue.title,
      selectedIssue.body,
      selectedIssue.author,
      aiProvider,
      currentModel,
      correction
    )
    const failed = !result || isTransientAIFailure(result) || isContextLimitFailure(result)

    if (failed) {
      log.warn('AI analysis failed or hit context limits.')
      const failureAction = await select(
        'Issue review failed. Choose a different model/provider to retry, or cancel:',
        [
          { label: 'Change model and retry', value: 'change-model' },
          { label: 'Change AI provider and retry', value: 'change-provider' },
          { label: 'Cancel issue review', value: 'cancel' },
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

    const action = await select('Choose what to do with this Issue review:', [
      { label: 'Post this Issue review', value: 'accept' },
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
              saveState(state)
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
  const success = await api.createIssueComment(
    platformRepo.projectPath,
    selectedIssueNumber,
    reviewText,
    platformRepo.owner,
    platformRepo.repo
  )

  if (success) {
    spinner.succeed(`Review comment successfully posted!`)
    console.log(`  ${colors.cyan}${selectedIssue.url}${colors.reset}\n`)
  } else {
    spinner.fail(`Failed to post review comment.`)
  }
}
