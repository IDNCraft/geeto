/**
 * Settings workflow - handles all settings menu interactions
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import {
  getBranchStrategyConfig,
  getCommitConfig,
  getOpenCodeZenConfigPath,
  getProtectedBranches,
  GLOBAL_GEETO_DIR,
  hasCodexConfig,
  hasGeminiConfig,
  hasGroqConfig,
  hasOpenRouterConfig,
  hasTrelloConfig,
  resolveConfigPath,
  saveBranchStrategyConfig,
  saveCommitConfig,
} from '../utils/config.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'

const configDirPath = () => path.join(process.cwd(), '.geeto')

const configFilePath = (name: string) => path.join(configDirPath(), `${name}.toml`)

const removeConfigFile = (name: string): boolean => {
  const p = resolveConfigPath(`${name}.toml`)
  if (existsSync(p)) {
    unlinkSync(p)
    return true
  }
  return false
}

const isConfigLocal = (name: string): boolean => existsSync(configFilePath(name))

const moveConfigToGlobal = (name: string): boolean => {
  const localPath = configFilePath(name)
  if (!existsSync(localPath)) return false
  try {
    if (!existsSync(GLOBAL_GEETO_DIR)) mkdirSync(GLOBAL_GEETO_DIR, { recursive: true })
    writeFileSync(
      path.join(GLOBAL_GEETO_DIR, `${name}.toml`),
      readFileSync(localPath, 'utf8'),
      'utf8'
    )
    unlinkSync(localPath)
    return true
  } catch {
    return false
  }
}

const AI_PROVIDERS = [
  'gemini',
  'openrouter',
  'groq',
  'codex',
  'github',
  'gitlab',
  'opencode-zen',
] as const
type AiProvider = (typeof AI_PROVIDERS)[number]

const globalConfigPath = (name: string) => path.join(GLOBAL_GEETO_DIR, `${name}.toml`)

const isConfigGlobal = (name: string): boolean => existsSync(globalConfigPath(name))

const globalProviders = (): AiProvider[] => AI_PROVIDERS.filter((p) => isConfigGlobal(p))

type ModelProvider = 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen'
type ModelProviderAvailability = Record<ModelProvider, boolean>

const getModelProviderAvailability = async (): Promise<ModelProviderAvailability> => {
  const [{ isAvailable: isCodexAvailable }, { isAvailable: isOpenCodeAvailable }] =
    await Promise.all([import('../api/codex-sdk.js'), import('../api/opencode.js')])

  return {
    'gemini': hasGeminiConfig(),
    'openrouter': hasOpenRouterConfig(),
    'groq': hasGroqConfig(),
    'codex': hasCodexConfig() && isCodexAvailable(),
    'opencode-zen': existsSync(getOpenCodeZenConfigPath()) && isOpenCodeAvailable(),
  }
}

const maskValue = (val: string): string =>
  val.length <= 8 ? '***' : `${val.slice(0, 4)}...${val.slice(-4)}`

const readGlobalConfigInfo = (name: AiProvider): string => {
  try {
    const content = readFileSync(globalConfigPath(name), 'utf8')
    const match = content.match(
      /(?:gemini_api_key|openrouter_api_key|api_key|token)\s*=\s*["']([^"']+)["']/
    )
    return match?.[1] ? maskValue(match[1]) : '(configured)'
  } catch {
    return '(configured)'
  }
}

const handleGlobalConfigSetting = async (): Promise<boolean | void> => {
  while (true) {
    const configured = globalProviders()

    const action = await select('Manage global config (~/.geeto/):', [
      { label: 'View saved credentials and provider status', value: 'view' },
      { label: 'Set up a provider for all projects', value: 'configure' },
      { label: 'Remove a provider from global config', value: 'remove' },
      { label: 'Return to settings menu', value: 'back' },
    ])

    if (action === 'back') return true

    if (action === 'view') {
      log.info(`Global config directory: ${GLOBAL_GEETO_DIR}\n`)
      for (const p of configured) {
        log.info(`  ${p.padEnd(12)} ${readGlobalConfigInfo(p)}`)
      }
      askQuestion(`\n  ${colors.gray}Press Enter to go back${colors.reset}`)
      continue
    }

    if (action === 'configure') {
      const provider = await select('Which provider should be available globally?', [
        { label: 'Gemini', value: 'gemini' },
        { label: 'OpenRouter', value: 'openrouter' },
        { label: 'Groq', value: 'groq' },
        { label: 'OpenAI Codex', value: 'codex' },
        { label: 'GitHub', value: 'github' },
        { label: 'GitLab', value: 'gitlab' },
        { label: 'OpenCode Zen', value: 'opencode-zen' },
        { label: 'Return to global config menu', value: 'back' },
      ])
      if (provider === 'back') continue

      const gp = globalConfigPath(provider)
      if (existsSync(gp)) unlinkSync(gp)

      switch (provider) {
        case 'gemini': {
          const { setupGeminiConfigInteractive } = await import('../core/gemini-setup.js')
          setupGeminiConfigInteractive()
          break
        }
        case 'openrouter': {
          const { setupOpenRouterConfigInteractive } = await import('../core/openrouter-setup.js')
          setupOpenRouterConfigInteractive()
          break
        }
        case 'groq': {
          const { setupGroqConfigInteractive } = await import('../core/groq-setup.js')
          setupGroqConfigInteractive()
          break
        }
        case 'codex': {
          const { setupCodexConfigInteractive } = await import('../core/codex-sdk-setup.js')
          await setupCodexConfigInteractive()
          break
        }
        case 'github': {
          const { setupGithubConfigInteractive } = await import('../core/github-setup.js')
          setupGithubConfigInteractive()
          break
        }
        case 'gitlab': {
          const { setupGitlabConfigInteractive } = await import('../core/gitlab-setup.js')
          setupGitlabConfigInteractive()
          break
        }
        case 'opencode-zen': {
          await handleOpenCodeSetting()
          break
        }
      }
      continue
    }

    if (action === 'remove') {
      const choices: { label: string; value: AiProvider | 'back' }[] = configured.map((p) => ({
        label: p,
        value: p,
      }))
      choices.push({ label: 'Return to global config menu', value: 'back' })
      const provider = await select('Which provider should be removed from global config?', choices)
      if (provider === 'back') continue

      const gp = globalConfigPath(provider)
      if (existsSync(gp)) {
        unlinkSync(gp)
        log.success(`Removed ${provider} from ~/.geeto/`)
      }
      continue
    }
  }
}

const runInteractiveSetup = async (name: 'trello' | 'openrouter' | 'gemini' | 'groq' | 'codex') => {
  if (name === 'trello') {
    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const trelloSetupSuccess = setupTrelloConfigInteractive()
    if (trelloSetupSuccess) {
      log.success('Trello integration configured!')
    } else {
      log.warn('Trello setup was not completed. Run `geeto --setup-trello` to try again.')
    }
    return
  }

  if (name === 'gemini') {
    const { setupGeminiConfigInteractive } = await import('../core/gemini-setup.js')
    const geminiSetupSuccess = setupGeminiConfigInteractive()
    if (geminiSetupSuccess) {
      log.success('Gemini AI integration configured!')
    } else {
      log.warn('Gemini setup was not completed. Run `geeto --setup-gemini` to try again.')
    }
    return
  }

  if (name === 'groq') {
    const { setupGroqConfigInteractive } = await import('../core/groq-setup.js')
    const groqSetupSuccess = setupGroqConfigInteractive()
    if (groqSetupSuccess) {
      log.success('Groq integration configured!')
    } else {
      log.warn('Groq setup was not completed. Run `geeto --setup-groq` to try again.')
    }
    return
  }

  if (name === 'codex') {
    const { setupCodexConfigInteractive } = await import('../core/codex-sdk-setup.js')
    const codexSetupSuccess = await setupCodexConfigInteractive()
    if (codexSetupSuccess) {
      log.success('OpenAI Codex integration configured!')
    } else {
      log.warn('OpenAI Codex setup was not completed. Run `geeto --setup-codex` to try again.')
    }
    return
  }

  const { setupOpenRouterConfigInteractive } = await import('../core/openrouter-setup.js')
  const openRouterSetupSuccess = setupOpenRouterConfigInteractive()
  if (openRouterSetupSuccess) {
    log.success('OpenRouter integration configured!')
  } else {
    log.warn('OpenRouter setup was not completed. Run `geeto --setup-openrouter` to try again.')
  }
}

const handlePrefixFormatSetting = async (): Promise<boolean | void> => {
  const config = getBranchStrategyConfig()
  const current = config?.prefixSeparator ?? '(auto-detect)'

  const choice = await select(`Choose branch prefix format (current: ${current}):`, [
    { label: 'Hash:  dev#branch-name', value: '#' },
    { label: 'Slash: dev/branch-name', value: '/' },
    { label: 'Auto-detect from existing branches', value: 'auto' },
    { label: 'Return to settings menu', value: 'back' },
  ])

  if (choice === 'back') return true

  const updated = config ?? { separator: '-' as const }
  updated.prefixSeparator = choice === 'auto' ? undefined : (choice as '#' | '/')
  saveBranchStrategyConfig(updated)

  log.success(
    choice === 'auto'
      ? 'Prefix format set to auto-detect'
      : `Prefix format set to: ${choice === '#' ? 'dev#name' : 'dev/name'}`
  )
  return false
}

const handleSeparatorSetting = async (): Promise<boolean | void> => {
  const separatorChoice = await select('Choose separator for generated branch names:', [
    { label: 'Hyphen (kebab-case): my-branch-name', value: 'hyphen' },
    { label: 'Underscore (snake_case): my_branch_name', value: 'underscore' },
    { label: 'Return to settings menu', value: 'back' },
  ])

  if (separatorChoice === 'back') {
    return true
  }

  const separator = separatorChoice === 'hyphen' ? '-' : '_'
  const config = getBranchStrategyConfig()
  if (config) {
    config.separator = separator
    saveBranchStrategyConfig(config)
  } else {
    saveBranchStrategyConfig({ separator })
  }

  log.success(`Branch separator set to: ${separator === '-' ? 'hyphen (-)' : 'underscore (_)'} `)
  // Explicitly return false to indicate "do not go back" to caller
  return false
}

/**
 * Handle protected branches configuration
 */
const handleProtectedBranchesSetting = async (): Promise<boolean | void> => {
  const currentProtected = getProtectedBranches()

  console.log('')
  log.info(
    `Current protected branches: ${colors.cyan}${currentProtected.join(', ')}${colors.reset}`
  )
  console.log(`${colors.gray}  (These branches are excluded from cleanup)${colors.reset}`)
  console.log('')

  const action = await select('Manage branches protected from cleanup:', [
    { label: 'Add branches to protected list', value: 'add' },
    { label: 'Restore default protected branches', value: 'reset' },
    { label: 'Return to settings menu', value: 'back' },
  ])

  if (action === 'back') {
    return true
  }

  const config = getBranchStrategyConfig()

  if (action === 'reset') {
    if (config) {
      config.protectedBranches = undefined
      saveBranchStrategyConfig(config)
    }
    log.success('Protected branches reset to defaults: main, master, development, develop, dev')
    return false
  }

  // Add branches
  const input = askQuestion('Enter branch names to protect (comma separated): ')
  const newBranches = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (newBranches.length === 0) {
    log.warn('No branches entered.')
    return false
  }

  // Merge with existing custom branches
  const existingCustom = config?.protectedBranches ?? []
  const merged = [...new Set([...existingCustom, ...newBranches])]

  if (config) {
    config.protectedBranches = merged
    saveBranchStrategyConfig(config)
  } else {
    saveBranchStrategyConfig({ separator: '-', protectedBranches: merged })
  }

  const allProtected = getProtectedBranches()
  const updatedList = `${colors.cyan}${allProtected.join(', ')}${colors.reset}`
  log.success(`Protected branches updated: ${updatedList}`)
  return false
}

// Sync OpenRouter models (fetch & persist detailed + simple lists)
const syncOpenRouterModels = async (): Promise<void> => {
  try {
    // Dynamically import SDK wrapper
    let sdkModule: unknown = null
    try {
      sdkModule = await import('../api/openrouter-sdk.js')
    } catch {
      log.warn('OpenRouter SDK unavailable; cannot get live sample models from SDK.')
      // Fall back to existing persisted-file behavior
    }

    const sdk = sdkModule as { getAvailableModelChoices?: () => Promise<unknown> }
    const fs = await import('node:fs')
    const outDir = path.join(process.cwd(), '.geeto')
    await fs.promises.mkdir(outDir, { recursive: true })

    if (sdk && typeof sdk.getAvailableModelChoices === 'function') {
      try {
        const spinner = new ScrambleProgress()
        spinner.start(['Fetching OpenRouter models...'])
        const detailed = (await sdk.getAvailableModelChoices()) as Array<
          Record<string, unknown>
        > | null
        spinner.stop()
        if (Array.isArray(detailed) && detailed.length > 0) {
          // Filter out image-generation-only models (geeto is for text/code tasks)
          const imageOnlyPrefixes = [
            'stabilityai/',
            'black-forest-labs/',
            'ideogram/',
            'recraft/',
            'aura-',
          ]
          const imageOnlyKeywords = [
            'dall-e',
            'flux',
            'midjourney',
            'imagen',
            'sdxl',
            'stable-diffusion',
          ]

          const textModels = detailed.filter((d) => {
            const val = String((d as Record<string, unknown>).value).toLowerCase()
            if (imageOnlyPrefixes.some((p) => val.includes(p))) return false
            if (imageOnlyKeywords.some((k) => val.includes(k))) return false
            return true
          })

          // Show multiselect for user to pick favorite models
          const choices = textModels.map((d) => ({
            label: String(
              (d as Record<string, unknown>).label ??
                (d as Record<string, unknown>).name ??
                (d as Record<string, unknown>).value
            ),
            value: String((d as Record<string, unknown>).value),
          }))

          // Pre-select: use currently saved models if available, else recommended defaults
          const savedModelFile = path.join(outDir, 'openrouter-model.json')
          let defaults: string[] = []
          try {
            const saved = JSON.parse(await fs.promises.readFile(savedModelFile, 'utf8')) as Array<{
              value?: string
            }>
            defaults = saved.map((m) => String(m.value ?? '')).filter(Boolean)
          } catch {
            // No saved models — use recommended defaults
            const recommended = [
              'anthropic/claude-sonnet-4',
              'anthropic/claude-haiku-4.5',
              'openai/gpt-4o',
              'openai/gpt-4.1',
              'openai/gpt-5-mini',
              'google/gemini-2.5-flash',
            ]
            defaults = choices
              .filter((c) => recommended.some((r) => c.value.includes(r)))
              .map((c) => c.value)
          }

          const selected = await multiSelect(
            'Select OpenRouter models to keep in your favorites:',
            choices,
            defaults
          )

          if (!selected || selected.length === 0) {
            log.info('No models selected. Sync cancelled.')
            return
          }

          type SimpleModel = { name?: string; label?: string; value?: string }
          const filtered = detailed.filter((d) =>
            selected.includes(String((d as Record<string, unknown>).value))
          ) as SimpleModel[]

          // Renumber auto-numbered labels sequentially
          const hasAutoNumber = filtered.some((d: SimpleModel) =>
            /^\s*\d+\./.test(String(d.label ?? d.name ?? d.value))
          )

          const simple = filtered.map((d: SimpleModel, idx: number) => {
            const rawLabel = String(d.label ?? d.name ?? d.value)
            const label = hasAutoNumber
              ? rawLabel.replace(/^\s*\d+\.\s*/, `${idx + 1}. `)
              : rawLabel
            return {
              label,
              value: d.value,
            }
          })

          const outModelFile = path.join(outDir, 'openrouter-model.json')
          await fs.promises.writeFile(outModelFile, JSON.stringify(simple, null, 2))

          log.info(`Saved ${simple.length} OpenRouter model(s) to .geeto/openrouter-model.json`)
          return
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        log.warn(`Failed to fetch OpenRouter models from SDK: ${msg}`)
      }
    }

    // SDK unavailable or returned no models; use saved models with multiSelect
    const modelFilePath = path.join(outDir, 'openrouter-model.json')
    if (fs.existsSync(modelFilePath)) {
      try {
        const raw = fs.readFileSync(modelFilePath, 'utf8')
        const parsed = JSON.parse(raw) as Array<{ label?: string; value?: string }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          const choices = parsed.map((m) => ({
            label: String(m.label ?? m.value ?? ''),
            value: String(m.value ?? ''),
          }))
          const defaults = choices.map((c) => c.value)
          const selected = await multiSelect(
            'Select saved OpenRouter models to keep in your favorites:',
            choices,
            defaults
          )
          if (!selected || selected.length === 0) {
            log.info('No models selected. Sync cancelled.')
            return
          }
          const simple = selected.map((val, idx) => {
            const detail = parsed.find((m) => m.value === val)
            const rawLabel = String(detail?.label ?? val)
            const label = rawLabel.replace(/^\s*\d+\.\s*/, `${idx + 1}. `)
            return { label, value: val }
          })
          await fs.promises.writeFile(modelFilePath, JSON.stringify(simple, null, 2))
          log.success(`Saved ${simple.length} OpenRouter model(s) to .geeto/openrouter-model.json`)
          return
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        log.warn(`Could not read OpenRouter model config: ${msg}`)
      }
    }

    log.warn('No OpenRouter models available. Run --sync-models after configuring OpenRouter.')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`OpenRouter model sync failed: ${msg}`)
  }
}

// Sync Gemini models (fetch from SDK & persist user favorites)
const syncGeminiModels = async (): Promise<void> => {
  try {
    let sdkModule: unknown = null
    try {
      sdkModule = await import('../api/gemini-sdk.js')
    } catch {
      log.warn('Gemini SDK unavailable. Configure Gemini first with --setup-gemini.')
      return
    }

    const sdk = sdkModule as { getAvailableModelChoices?: () => Promise<unknown> }

    if (!sdk || typeof sdk.getAvailableModelChoices !== 'function') {
      log.warn('Gemini SDK unavailable. Configure Gemini first with --setup-gemini.')
      return
    }

    const spinner = new ScrambleProgress()
    spinner.start(['Fetching Gemini models...'])
    const detailed = (await sdk.getAvailableModelChoices()) as Array<Record<string, unknown>> | null
    spinner.stop()

    if (!Array.isArray(detailed) || detailed.length === 0) {
      log.warn('No Gemini models found. Check your Gemini API key.')
      return
    }

    // Filter out image-generation-only models
    const imageKeywords = ['imagen', 'veo', 'lyria']
    const textModels = detailed.filter((d) => {
      const val = String(d.value ?? d.id).toLowerCase()
      return !imageKeywords.some((k) => val.includes(k))
    })

    if (textModels.length === 0) {
      log.warn('No text Gemini models found. Check your Gemini API key.')
      return
    }

    const choices = textModels.map((d) => ({
      label: String(d.label ?? d.name ?? d.value),
      value: String(d.value ?? d.id),
    }))

    // Pre-select: use currently saved models if available, else recommended defaults
    const fsModule = await import('node:fs')
    const savedGeminiFile = path.join(process.cwd(), '.geeto', 'gemini-model.json')
    let defaults: string[] = []
    try {
      const saved = JSON.parse(fsModule.readFileSync(savedGeminiFile, 'utf8')) as Array<{
        value?: string
      }>
      defaults = saved.map((m) => String(m.value ?? '')).filter(Boolean)
    } catch {
      // No saved models — use recommended defaults
      const recommended = new Set([
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-flash-latest',
        'gemini-pro-latest',
      ])
      defaults = choices
        .filter((c) => {
          const stripped = c.value.toLowerCase().replace('models/', '')
          return recommended.has(stripped)
        })
        .map((c) => c.value)
    }

    const selected = await multiSelect(
      'Select Gemini models to keep in your favorites:',
      choices,
      defaults
    )

    if (!selected || selected.length === 0) {
      log.info('No models selected. Sync cancelled.')
      return
    }

    // Build model list — keep full labels, just re-number
    const simple = selected.map((val, idx) => {
      const detail = detailed.find((d) => String(d.value ?? d.id) === val)
      const rawLabel = String(detail?.label ?? detail?.name ?? val)
      const label = rawLabel.replace(/^\s*\d+\.\s*/, `${idx + 1}. `)
      return {
        label,
        value: val,
      }
    })

    // Save to gemini-model.json
    const outDir = path.join(process.cwd(), '.geeto')
    await fsModule.promises.mkdir(outDir, { recursive: true })
    const outGeminiFile = path.join(outDir, 'gemini-model.json')
    await fsModule.promises.writeFile(outGeminiFile, JSON.stringify(simple, null, 2))

    log.success(`Saved ${simple.length} Gemini model(s) to .geeto/gemini-model.json`)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`Gemini model sync failed: ${msg}`)
  }
}

// Sync Groq models (fetch live, pre-select free ones as defaults)
const syncGroqModels = async (): Promise<void> => {
  try {
    let sdkModule: unknown = null
    try {
      sdkModule = await import('../api/groq-sdk.js')
    } catch {
      log.warn('Groq SDK unavailable. Configure Groq first with --setup-groq.')
      return
    }

    const sdk = sdkModule as { getGroqModels?: () => Promise<unknown>; isAvailable?: () => boolean }

    if (!sdk || typeof sdk.getGroqModels !== 'function') {
      log.warn('Groq SDK unavailable. Configure Groq first with --setup-groq.')
      return
    }

    if (typeof sdk.isAvailable === 'function' && !sdk.isAvailable()) {
      const { setupGroqConfigInteractive } = await import('../core/groq-setup.js')
      const setupOk = setupGroqConfigInteractive()
      if (!setupOk) return
    }

    const spinner = new ScrambleProgress()
    spinner.start(['Fetching Groq models...'])
    const models = (await sdk.getGroqModels()) as Array<{ label: string; value: string }> | null
    spinner.stop()

    if (!Array.isArray(models) || models.length === 0) {
      log.warn('No Groq models found.')
      return
    }

    // Pre-select all free models as defaults
    const freeModels = new Set([
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ])
    const defaults = models.filter((m) => freeModels.has(m.value)).map((m) => m.value)

    const selected = await multiSelect(
      'Select Groq models to keep in your favorites:',
      models,
      defaults
    )

    if (!selected || selected.length === 0) {
      log.info('No models selected. Sync cancelled.')
      return
    }

    const simple = selected.map((val, idx) => {
      const detail = models.find((m) => m.value === val)
      return { label: `${idx + 1}. ${detail?.label ?? val}`, value: val }
    })

    const fsModule = await import('node:fs')
    const outDir = path.join(process.cwd(), '.geeto')
    await fsModule.promises.mkdir(outDir, { recursive: true })
    const outFile = path.join(outDir, 'groq-model.json')
    await fsModule.promises.writeFile(outFile, JSON.stringify(simple, null, 2))

    log.success(`Saved ${simple.length} Groq model(s) to .geeto/groq-model.json`)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`Groq model sync failed: ${msg}`)
  }
}

// Sync OpenAI Codex models (fetch from SDK & persist user favorites)
const syncCodexModels = async (): Promise<void> => {
  try {
    if (!hasCodexConfig()) {
      log.warn('OpenAI Codex is not set up. Run `geeto --setup-codex` first.')
      return
    }

    let sdkModule: unknown = null
    try {
      sdkModule = await import('../api/codex-sdk.js')
    } catch {
      log.warn('OpenAI Codex unavailable. Configure OpenAI Codex first.')
      return
    }

    const sdk = sdkModule as {
      getCodexModels?: () => Promise<unknown>
      isAvailable?: () => boolean
    }

    if (!sdk || typeof sdk.getCodexModels !== 'function') {
      log.warn('OpenAI Codex unavailable. Configure OpenAI Codex first.')
      return
    }

    if (typeof sdk.isAvailable === 'function' && !sdk.isAvailable()) {
      log.warn('OpenAI Codex runtime is unavailable. Run `geeto --setup-codex` first.')
      return
    }

    const spinner = new ScrambleProgress()
    spinner.start(['Fetching OpenAI Codex models...'])
    const models = (await sdk.getCodexModels()) as Array<{ label: string; value: string }> | null
    spinner.stop()

    if (!Array.isArray(models) || models.length === 0) {
      log.warn('No OpenAI Codex models found.')
      return
    }

    const defaults = models.map((m) => m.value)

    const selected = await multiSelect(
      'Select OpenAI Codex models to keep in your favorites:',
      models,
      defaults
    )

    if (!selected || selected.length === 0) {
      log.info('No models selected. Sync cancelled.')
      return
    }

    const simple = selected.map((val, idx) => {
      const detail = models.find((m) => m.value === val)
      return { label: `${idx + 1}. ${detail?.label ?? val}`, value: val }
    })

    const fsModule = await import('node:fs')
    const outDir = path.join(process.cwd(), '.geeto')
    await fsModule.promises.mkdir(outDir, { recursive: true })
    const outFile = path.join(outDir, 'codex-model.json')
    await fsModule.promises.writeFile(outFile, JSON.stringify(simple, null, 2))

    log.success(`Saved ${simple.length} OpenAI Codex model(s) to .geeto/codex-model.json`)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`OpenAI Codex model sync failed: ${msg}`)
  }
}

const syncOpenCodeModels = async (): Promise<boolean> => {
  try {
    const opencodeApi = await import('../api/opencode.js')
    if (!opencodeApi.isAvailable()) {
      log.warn('OpenCode Zen is not set up. Run `geeto --setup-opencode` first.')
      return false
    }

    const models = await opencodeApi.getOpenCodeModels()
    if (models.length === 0) {
      log.warn('No OpenCode Zen models found. Configure OpenCode Zen first.')
      return false
    }

    const freeModelValues = models.filter((model) => model.isFree).map((model) => model.value)
    const selected = await multiSelect(
      'Select OpenCode Zen models to keep in your favorites:',
      models,
      freeModelValues
    )
    if (!selected || selected.length === 0) {
      log.info('No models selected. Sync cancelled.')
      return false
    }

    const fsModule = await import('node:fs')
    const outDir = path.join(process.cwd(), '.geeto')
    await fsModule.promises.mkdir(outDir, { recursive: true })
    const outFile = path.join(outDir, 'opencode-model.json')
    const simple = selected.map((value, index) => ({
      label: `${index + 1}. ${models.find((model) => model.value === value)?.label ?? value}`,
      value,
    }))
    await fsModule.promises.writeFile(outFile, JSON.stringify(simple, null, 2))
    log.success(`Saved ${simple.length} OpenCode Zen model(s) to .geeto/opencode-model.json`)
    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`OpenCode Zen model sync failed: ${msg}`)
    return false
  }
}

const handleModelResetSetting = async (): Promise<boolean | void> => {
  const providerAvailability = await getModelProviderAvailability()
  if (!Object.values(providerAvailability).some(Boolean)) {
    log.warn('No AI provider is set up. Configure one before managing model favorites.')
    return false
  }

  const resetChoice = await select('Which provider model favorites should be updated?', [
    {
      label: providerAvailability.gemini ? 'Gemini' : 'Gemini (run geeto --setup-gemini first)',
      value: 'gemini',
      disabled: !providerAvailability.gemini,
    },
    {
      label: providerAvailability.openrouter
        ? 'OpenRouter'
        : 'OpenRouter (run geeto --setup-openrouter first)',
      value: 'openrouter',
      disabled: !providerAvailability.openrouter,
    },
    {
      label: providerAvailability.groq ? 'Groq' : 'Groq (run geeto --setup-groq first)',
      value: 'groq',
      disabled: !providerAvailability.groq,
    },
    {
      label: providerAvailability.codex
        ? 'OpenAI Codex'
        : 'OpenAI Codex (run geeto --setup-codex first)',
      value: 'codex',
      disabled: !providerAvailability.codex,
    },
    {
      label: providerAvailability['opencode-zen']
        ? 'OpenCode Zen'
        : 'OpenCode Zen (run geeto --setup-opencode first)',
      value: 'opencode-zen',
      disabled: !providerAvailability['opencode-zen'],
    },
    { label: 'Return to settings menu', value: 'back' },
  ])

  if (resetChoice === 'back') {
    return true
  }
  const selectedProvider = resetChoice as ModelProvider
  if (!providerAvailability[selectedProvider]) {
    log.warn(`Provider ${selectedProvider} is not set up. Configure it first.`)
    return false
  }

  try {
    let modelSyncCompleted = true
    if (resetChoice === 'openrouter') {
      await syncOpenRouterModels()
    }
    if (resetChoice === 'gemini') {
      await syncGeminiModels()
    }
    if (resetChoice === 'groq') {
      await syncGroqModels()
    }
    if (resetChoice === 'codex') {
      await syncCodexModels()
    }
    if (resetChoice === 'opencode-zen') {
      modelSyncCompleted = await syncOpenCodeModels()
    }

    if (modelSyncCompleted) log.success('Model sync completed!')
  } catch (error) {
    log.error(`Model sync failed: ${error}`)
  }

  // Explicitly return false when leaving handler without going back
  return false
}

/**
 * Change provider/model (interactive)
 */
const handleChangeModelSetting = async (): Promise<boolean | void> => {
  const { chooseModelForProvider } = await import('../utils/git-ai.js')
  const providerAvailability = await getModelProviderAvailability()
  const provOptions = [
    {
      label: providerAvailability.gemini ? 'Gemini' : 'Gemini (run geeto --setup-gemini first)',
      value: 'gemini',
      disabled: !providerAvailability.gemini,
    },
    {
      label: providerAvailability.openrouter
        ? 'OpenRouter'
        : 'OpenRouter (run geeto --setup-openrouter first)',
      value: 'openrouter',
      disabled: !providerAvailability.openrouter,
    },
    {
      label: providerAvailability.groq ? 'Groq' : 'Groq (run geeto --setup-groq first)',
      value: 'groq',
      disabled: !providerAvailability.groq,
    },
    {
      label: providerAvailability.codex
        ? 'OpenAI Codex'
        : 'OpenAI Codex (run geeto --setup-codex first)',
      value: 'codex',
      disabled: !providerAvailability.codex,
    },
    {
      label: providerAvailability['opencode-zen']
        ? 'OpenCode Zen'
        : 'OpenCode Zen (run geeto --setup-opencode first)',
      value: 'opencode-zen',
      disabled: !providerAvailability['opencode-zen'],
    },
    { label: 'Back to settings menu', value: 'back' },
  ]

  const chosenProv = await select('Which provider should use a different model?', provOptions)
  if (chosenProv === 'back') {
    // User explicitly asked to go back to settings menu
    return true
  }

  const selectedProvider = chosenProv as ModelProvider
  if (!providerAvailability[selectedProvider]) {
    log.warn(`Provider ${selectedProvider} is not set up. Configure it first.`)
    return false
  }

  const picked = await chooseModelForProvider(
    chosenProv as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen',
    undefined,
    'Back to settings menu'
  )
  if (picked === 'back') {
    log.info('Model change cancelled.')
    return true
  }
  if (picked === undefined) {
    if (chosenProv === 'opencode-zen') {
      log.warn('OpenCode Zen setup unavailable. Run `geeto --setup-opencode` first.')
    } else {
      log.warn('Provider setup not available; cannot change model.')
    }
    return false
  }

  // Persist choice into checkpoint state so it is used next run
  const stateModule = await import('../utils/state.js')
  const { loadState, saveState } = stateModule
  const existing = loadState()
  const now = new Date().toISOString()

  const base = existing ?? {
    step: 0,
    workingBranch: '',
    targetBranch: '',
    currentBranch: '',
    timestamp: now,
    aiProvider: chosenProv as 'gemini' | 'openrouter' | 'groq' | 'codex' | 'manual',
    openrouterModel: undefined,
    geminiModel: undefined,
    groqModel: undefined,
    codexModel: undefined,
    opencodeModel: undefined,
  }

  base.aiProvider = chosenProv as
    | 'gemini'
    | 'openrouter'
    | 'groq'
    | 'codex'
    | 'opencode-zen'
    | 'manual'

  switch (chosenProv) {
    case 'openrouter': {
      base.openrouterModel = picked as string
      base.geminiModel = undefined
      break
    }
    case 'gemini': {
      base.geminiModel = picked as string
      base.openrouterModel = undefined
      break
    }
    case 'groq': {
      base.groqModel = picked as string
      base.openrouterModel = undefined
      base.geminiModel = undefined
      base.codexModel = undefined
      break
    }
    case 'codex': {
      base.codexModel = picked as string
      base.openrouterModel = undefined
      base.geminiModel = undefined
      base.groqModel = undefined
      base.opencodeModel = undefined
      break
    }
    case 'opencode-zen': {
      base.opencodeModel = picked as string
      base.openrouterModel = undefined
      base.geminiModel = undefined
      base.groqModel = undefined
      base.codexModel = undefined
      break
    }
    default: {
      break
    }
  }

  base.timestamp = now

  saveState(base)
  const providerLabel =
    {
      'gemini': 'Gemini',
      'openrouter': 'OpenRouter',
      'groq': 'Groq',
      'codex': 'OpenAI Codex',
      'opencode-zen': 'OpenCode Zen',
    }[chosenProv] ?? chosenProv
  log.success(`Set ${providerLabel} model to: ${picked}`)
  // Done; do not go back to settings menu
  return false
}
const handleGeminiSetting = async (): Promise<boolean | void> => {
  const hasConfig = hasGeminiConfig()

  if (!hasConfig) {
    const spinner = log.spinner()
    spinner.start('Setting up Gemini AI integration...')
    await runInteractiveSetup('gemini')
    spinner.stop()
    return false
  }

  const action = await select('Gemini AI integration is configured. Choose a setup action:', [
    { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
    { label: 'Remove configuration', value: 'remove' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  switch (action) {
    case 'reconfigure': {
      log.info('Reconfiguring Gemini AI integration...')
      if (removeConfigFile('gemini')) log.info('Cleared existing Gemini configuration')
      const { setupGeminiConfigInteractive } = await import('../core/gemini-setup.js')
      const setupSuccess = setupGeminiConfigInteractive()
      if (setupSuccess) {
        log.success('Gemini AI integration reconfigured!')
      } else {
        log.warn('Gemini setup was not completed. Run `geeto --setup-gemini` to try again.')
      }
      break
    }
    case 'remove': {
      const confirmRemove = confirm(
        'Remove the saved Gemini API key and configuration from ~/.geeto?'
      )
      if (confirmRemove) {
        if (removeConfigFile('gemini')) {
          log.success('Gemini configuration removed!')
        } else {
          log.warn('Failed to remove Gemini configuration.')
        }
      }
      break
    }
    case 'back': {
      return true
    }
  }

  // Completed without returning to settings menu
  return false
}

const handleTrelloSetting = async (): Promise<boolean | void> => {
  const hasConfig = hasTrelloConfig()

  if (!hasConfig) {
    await runInteractiveSetup('trello')
    return false
  }

  const action = await select('Trello integration is configured. Choose a setup action:', [
    { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
    { label: 'Remove configuration', value: 'remove' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  if (action === 'reconfigure') {
    log.info('Reconfiguring Trello integration...')
    if (removeConfigFile('trello')) {
      log.info('Cleared existing Trello configuration')
    }

    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const setupSuccess = setupTrelloConfigInteractive()
    if (setupSuccess) {
      log.success('Trello integration reconfigured!')
    } else {
      log.warn('Trello setup was not completed. Run `geeto --setup-trello` to try again.')
    }
  } else if (action === 'remove') {
    const confirmRemove = confirm('Remove the saved Trello credentials from ~/.geeto?')
    if (!confirmRemove) {
      return false
    }
    if (removeConfigFile('trello')) {
      log.success('Trello configuration removed!')
    } else {
      log.info('No Trello configuration found to remove')
    }
  }
  if (action === 'back') {
    return true
  }

  // Completed without returning to settings menu
  return false
}

const handleOpenRouterSetting = async (): Promise<boolean | void> => {
  const { hasOpenRouterConfig } = await import('../utils/config.js')
  const hasConfig = hasOpenRouterConfig()

  if (!hasConfig) {
    await runInteractiveSetup('openrouter')
    return false
  }

  const action = await select('OpenRouter integration is configured. Choose a setup action:', [
    { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
    { label: 'Remove configuration', value: 'remove' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  switch (action) {
    case 'reconfigure': {
      log.info('Reconfiguring OpenRouter integration...')
      if (removeConfigFile('openrouter')) log.info('Cleared existing OpenRouter configuration')
      await runInteractiveSetup('openrouter')
      log.success('OpenRouter integration reconfigured!')
      break
    }
    case 'remove': {
      const confirmRemove = confirm(
        'Remove the saved OpenRouter API key and configuration from ~/.geeto?'
      )
      if (!confirmRemove) return false
      if (removeConfigFile('openrouter')) {
        log.success('OpenRouter configuration removed!')
      } else {
        log.info('No OpenRouter configuration found to remove')
      }
      break
    }
    case 'back': {
      return true
    }
  }

  // Completed without returning to settings menu
  return false
}

const handleGroqSetting = async (): Promise<boolean | void> => {
  const { hasGroqConfig } = await import('../utils/config.js')
  const hasConfig = hasGroqConfig()

  if (!hasConfig) {
    await runInteractiveSetup('groq')
    return false
  }

  const action = await select('Groq integration is configured. Choose a setup action:', [
    { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
    { label: 'Remove configuration', value: 'remove' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  switch (action) {
    case 'reconfigure': {
      log.info('Reconfiguring Groq integration...')
      if (removeConfigFile('groq')) log.info('Cleared existing Groq configuration')
      await runInteractiveSetup('groq')
      log.success('Groq integration reconfigured!')
      break
    }
    case 'remove': {
      const confirmRemove = confirm(
        'Remove the saved Groq API key and configuration from ~/.geeto?'
      )
      if (!confirmRemove) return false
      if (removeConfigFile('groq')) {
        log.success('Groq configuration removed!')
      } else {
        log.info('No Groq configuration found to remove')
      }
      break
    }
    case 'back': {
      return true
    }
  }
  return false
}

export const handleCodexSetting = async (): Promise<boolean | void> => {
  const { installCodexRuntime, isAvailable } = await import('../api/codex-sdk.js')
  if (!isAvailable()) {
    log.info('OpenAI Codex isolated runtime is not installed. Setting it up...')
    if (!installCodexRuntime()) {
      log.warn('OpenAI Codex isolated runtime setup failed.')
      return false
    }
  }

  const { hasCodexConfig } = await import('../utils/config.js')
  const hasConfig = hasCodexConfig()

  if (!hasConfig) {
    await runInteractiveSetup('codex')
    return false
  }

  const action = await select('OpenAI Codex integration is configured. Choose a setup action:', [
    { label: 'Reconfigure (check local installation)', value: 'reconfigure' },
    { label: 'Remove configuration', value: 'remove' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  switch (action) {
    case 'reconfigure': {
      log.info('Reconfiguring OpenAI Codex integration...')
      if (removeConfigFile('codex')) log.info('Cleared existing OpenAI Codex configuration')
      await runInteractiveSetup('codex')
      log.success('OpenAI Codex integration reconfigured!')
      break
    }
    case 'remove': {
      const confirmRemove = confirm('Remove the saved OpenAI Codex configuration from ~/.geeto?')
      if (!confirmRemove) return false
      if (removeConfigFile('codex')) {
        log.success('OpenAI Codex configuration removed!')
      } else {
        log.info('No OpenAI Codex configuration found to remove')
      }
      break
    }
    case 'back': {
      return true
    }
  }
  return false
}

const handleOpenCodeSetting = async (): Promise<boolean | void> => {
  const { ensureOpenCode } = await import('../core/setup.js')
  const ready = await ensureOpenCode()
  if (!ready) return false

  const access = await select('OpenCode Zen access:', [
    { label: 'Use free models only', value: 'free' },
    { label: 'Enter OpenCode Zen API key', value: 'key' },
  ])

  const opencodeApi = await import('../api/opencode.js')
  if (access === 'key') {
    const apiKey = askQuestion('Enter OpenCode Zen API key: ').trim()
    if (!apiKey) {
      log.info('No API key entered; free OpenCode Zen models remain available.')
      return false
    }

    const valid = await opencodeApi.setOpenCodeZenApiKey(apiKey)
    if (valid) {
      log.success('OpenCode Zen API key is valid. All OpenCode Zen models are available.')
    } else {
      log.warn('OpenCode Zen API key is invalid. Only free models are available.')
    }
    return false
  }

  opencodeApi.useFreeOpenCodeZenModels()
  log.success('OpenCode Zen ready with free models.')
  return false
}

const handleSaveGlobalAiConfig = (): boolean | void => {
  const providers = ['gemini', 'openrouter', 'groq', 'codex', 'github', 'gitlab'] as const
  const local = providers.filter((p) => isConfigLocal(p))

  if (local.length === 0) {
    log.info('No local AI config found — already global or not configured.')
    return false
  }

  log.info(`Local AI config found: ${local.join(', ')}`)
  const ok = confirm(`Save all to ~/.geeto/ and use across all projects?`)
  if (!ok) return false

  let saved = 0
  for (const p of local) {
    if (moveConfigToGlobal(p)) {
      log.success(`${p}: saved to ${GLOBAL_GEETO_DIR}/${p}.toml`)
      saved++
    } else {
      log.error(`${p}: failed`)
    }
  }

  if (saved > 0) log.success(`Done — ${saved} config(s) saved to ${GLOBAL_GEETO_DIR}`)
  return false
}

const handleCommitStyleSetting = async (): Promise<boolean | void> => {
  const current = getCommitConfig()

  while (true) {
    const commitChoice = await select('Commit settings:', [
      {
        label: `Style  (${current?.tone ?? 'technical'})`,
        value: 'tone',
      },
      {
        label: `Subject length  (${current?.subjectLength ?? 72} chars)`,
        value: 'subject-length',
      },
      {
        label: `Body style  (${current?.style ?? 'multiline'})`,
        value: 'body-style',
      },
      { label: 'Back to settings menu', value: 'back' },
    ])
    if (commitChoice === 'back') return true

    if (commitChoice === 'tone') {
      const toneChoice = await select('Commit tone:', [
        { label: 'Technical  (Precise and specific)', value: 'technical' },
        { label: 'Concise  (Short and compact)', value: 'concise' },
        { label: 'Descriptive  (Natural and explanatory)', value: 'descriptive' },
        { label: 'Return to commit settings', value: 'back' },
      ])
      if (toneChoice === 'back') continue

      saveCommitConfig({
        style: current?.style ?? 'multiline',
        subjectLength: current?.subjectLength ?? 72,
        tone: toneChoice as 'technical' | 'concise' | 'descriptive',
      })
      log.success(`Commit tone set to ${toneChoice}`)
      return false
    }

    if (commitChoice === 'subject-length') {
      const lengthChoice = await select(
        `Subject length (current: ${current?.subjectLength ?? 72}):`,
        [
          { label: '50 chars  (conventional commits standard)', value: '50' },
          { label: '72 chars  (git standard)', value: '72' },
          { label: '100 chars  (modern projects)', value: '100' },
          { label: 'Return to commit settings', value: 'back' },
        ]
      )
      if (lengthChoice === 'back') continue

      saveCommitConfig({
        style: current?.style ?? 'multiline',
        subjectLength: Number.parseInt(lengthChoice, 10) as 50 | 72 | 100,
        tone: current?.tone,
      })
      log.success(`Subject length set to ${lengthChoice} chars`)
      return false
    }

    if (commitChoice === 'body-style') {
      const bodyChoice = await select('Body style:', [
        { label: 'Multiline  (subject + body with blank line)', value: 'multiline' },
        { label: 'Singleline  (subject only, no body)', value: 'singleline' },
        { label: 'Return to commit settings', value: 'back' },
      ])
      if (bodyChoice === 'back') continue

      saveCommitConfig({
        style: bodyChoice as 'singleline' | 'multiline',
        subjectLength: current?.subjectLength ?? 72,
        tone: current?.tone,
      })
      log.success(`Body style set to ${bodyChoice}`)
      return false
    }
  }
}

export const showSettingsMenu = async () => {
  while (true) {
    log.info('Geeto settings')

    const hasLocalGeetoFolder = existsSync(configDirPath())
    const hasLocalAiConfig = ['gemini', 'openrouter', 'groq', 'codex', 'github', 'gitlab'].some(
      (p) => isConfigLocal(p)
    )

    const menuOptions: Array<{ label: string; value: string; disabled?: boolean }> = [
      { label: 'AI provider & models', value: '_ai' },
      { label: 'Branch naming', value: '_branch' },
      { label: 'Commit messages', value: '_commit' },

      { label: 'Integrations & credentials', value: '_setup' },
      { label: 'System & global config', value: '_system' },
      { label: 'Return to main menu', value: 'back' },
    ]

    const settingChoice = await select('What do you want to configure?', menuOptions)

    if (settingChoice === 'back') {
      break
    }

    if (settingChoice === '_branch') {
      const branchConfig = getBranchStrategyConfig()
      const branchChoice = await select('Choose a branch naming setting:', [
        { label: 'Prefix format  (dev#name / dev/name)', value: 'prefix' },
        { label: 'Name separator  (hyphen / underscore)', value: 'separator' },
        { label: `Maximum words  (current: ${branchConfig?.maxWords ?? 3})`, value: 'max-words' },
        { label: 'Protected branches for cleanup', value: 'protected' },
        { label: 'Return to settings', value: 'back' },
      ])
      if (branchChoice === 'back') continue

      if (branchChoice === 'prefix') {
        const back = await handlePrefixFormatSetting()
        if (back) continue
      }
      if (branchChoice === 'separator') {
        const back = await handleSeparatorSetting()
        if (back) continue
      }
      if (branchChoice === 'max-words') {
        const wordChoice = await select(
          `Max words in branch name (current: ${branchConfig?.maxWords ?? 3}):`,
          [
            { label: '1 word', value: '1' },
            { label: '2 words', value: '2' },
            { label: '3 words', value: '3' },
            { label: 'Return to branch settings', value: 'back' },
          ]
        )
        if (wordChoice === 'back') continue
        const updated = branchConfig ?? { separator: '-' as const }
        updated.maxWords = Number.parseInt(wordChoice, 10)
        saveBranchStrategyConfig(updated)
        log.success(`Branch max words set to ${wordChoice}`)
        // fall through to "Configure another setting?"
      }
      if (branchChoice === 'protected') {
        const back = await handleProtectedBranchesSetting()
        if (back) continue
      }
      // fall through to "Configure another setting?"
    }

    if (settingChoice === '_ai') {
      const providerAvailability = await getModelProviderAvailability()
      const hasConfiguredModelProvider = Object.values(providerAvailability).some(Boolean)
      const aiChoice = await select('Choose an AI setting:', [
        { label: 'Change active provider and model', value: 'change-model' },
        {
          label: hasConfiguredModelProvider
            ? 'Manage saved model favorites'
            : 'Manage saved model favorites (set up a provider first)',
          value: 'models',
          disabled: !hasConfiguredModelProvider,
        },
        { label: 'Return to settings', value: 'back' },
      ])
      if (aiChoice === 'back') continue

      if (aiChoice === 'change-model') {
        const back = await handleChangeModelSetting()
        if (back) continue
      }
      if (aiChoice === 'models') {
        const back = await handleModelResetSetting()
        if (back) continue
      }
      // fall through to "Configure another setting?"
    }

    if (settingChoice === '_commit') {
      const back = await handleCommitStyleSetting()
      if (back) continue
      // fall through to "Configure another setting?"
    }

    if (settingChoice === '_setup') {
      const setupChoice = await select('Choose an integration or credential to configure:', [
        { label: 'Gemini', value: 'gemini' },
        { label: 'OpenRouter', value: 'openrouter' },
        { label: 'Groq', value: 'groq' },
        { label: 'OpenAI Codex', value: 'codex' },
        { label: 'OpenCode Zen', value: 'opencode-zen' },
        { label: 'GitHub access', value: 'github' },
        { label: 'GitLab access', value: 'gitlab' },
        { label: 'Trello integration', value: 'trello' },
        { label: 'Return to settings', value: 'back' },
      ])
      if (setupChoice === 'back') continue

      if (setupChoice === 'gemini') {
        const back = await handleGeminiSetting()
        if (back) continue
      }
      if (setupChoice === 'openrouter') {
        const back = await handleOpenRouterSetting()
        if (back) continue
      }
      if (setupChoice === 'groq') {
        const back = await handleGroqSetting()
        if (back) continue
      }
      if (setupChoice === 'codex') {
        const back = await handleCodexSetting()
        if (back) continue
      }
      if (setupChoice === 'opencode-zen') {
        const back = await handleOpenCodeSetting()
        if (back) continue
      }
      if (setupChoice === 'github') {
        const { setupGithubConfigInteractive } = await import('../core/github-setup.js')
        setupGithubConfigInteractive()
      }
      if (setupChoice === 'gitlab') {
        const { setupGitlabConfigInteractive } = await import('../core/gitlab-setup.js')
        setupGitlabConfigInteractive()
      }
      if (setupChoice === 'trello') {
        const back = await handleTrelloSetting()
        if (back) continue
      }
      // fall through to "Configure another setting?"
    }

    if (settingChoice === '_system') {
      const systemOptions: Array<{ label: string; value: string }> = [
        { label: 'Check installation details', value: 'where' },
        { label: 'Uninstall Geeto', value: 'uninstall' },
      ]
      if (hasLocalGeetoFolder && hasLocalAiConfig) {
        systemOptions.push({
          label: 'Move local AI config to global (~/.geeto/)',
          value: 'save-global',
        })
      }
      systemOptions.push(
        { label: 'Manage global config (~/.geeto/)', value: 'global-config' },
        { label: 'Return to settings', value: 'back' }
      )

      const systemChoice = await select('Choose a system setting:', systemOptions)
      if (systemChoice === 'back') continue

      switch (systemChoice) {
        case 'where': {
          const { handleWhereInstalled } = await import('./doctor.js')
          await handleWhereInstalled()
          // fall through to "Configure another setting?"

          break
        }
        case 'uninstall': {
          const { handleUninstall } = await import('./doctor.js')
          await handleUninstall()
          process.exit(0)

          break
        }
        case 'save-global': {
          handleSaveGlobalAiConfig()
          // fall through to "Configure another setting?"

          break
        }
        case 'global-config': {
          const back = await handleGlobalConfigSetting()
          if (back) continue
          // fall through to "Configure another setting?"

          break
        }
        // No default
      }
      // fall through to "Configure another setting?"
    }

    // Legacy flat handlers — kept for safety
    if (settingChoice === 'prefix') {
      const back = await handlePrefixFormatSetting()
      if (back) continue
    }
    if (settingChoice === 'separator') {
      const back = await handleSeparatorSetting()
      if (back) continue
    }
    if (settingChoice === 'protected') {
      const back = await handleProtectedBranchesSetting()
      if (back) continue
    }
    if (settingChoice === 'models') {
      const back = await handleModelResetSetting()
      if (back) continue
    }
    if (settingChoice === 'change-model') {
      const back = await handleChangeModelSetting()
      if (back) continue
    }
    if (settingChoice === 'gemini') {
      const back = await handleGeminiSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'trello') {
      const back = await handleTrelloSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'openrouter') {
      const back = await handleOpenRouterSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'groq') {
      const back = await handleGroqSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'codex') {
      const back = await handleCodexSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'opencode-zen') {
      const back = await handleOpenCodeSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'where') {
      const { handleWhereInstalled } = await import('./doctor.js')
      await handleWhereInstalled()
      askQuestion(`  ${colors.gray}Press Enter to go back${colors.reset}`)
      continue
    }
    if (settingChoice === 'uninstall') {
      const { handleUninstall } = await import('./doctor.js')
      await handleUninstall()
      break
    }

    console.log('')
    // Ask if user wants to continue with settings
    const continueSettings = confirm('Configure another setting?')
    if (!continueSettings) {
      break
    }
  }
}

export {
  handlePrefixFormatSetting,
  handleSeparatorSetting,
  handleProtectedBranchesSetting,
  handleModelResetSetting,
  handleChangeModelSetting,
  handleGeminiSetting,
  handleOpenRouterSetting,
  handleGroqSetting,
  handleOpenCodeSetting,
  handleTrelloSetting,
}
