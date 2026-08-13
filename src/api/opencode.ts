import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OpencodeClient, TextPart } from '@opencode-ai/sdk'
import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk'

import {
  buildCommitPrompt,
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { isOpenCodeZenApiKeyValidated, setOpenCodeZenApiKeyValidated } from '../utils/config.js'
import { log } from '../utils/logging.js'

export type OpenCodeModel = string

const OPENCODE_ZEN_PROVIDER_ID = 'opencode'

export interface OpenCodeModelChoice {
  label: string
  value: string
  isFree: boolean
}

type OpenCodeRuntime = {
  client: OpencodeClient
  close: () => void
}

const OPENCODE_ZEN_RUNTIME_ROOT = path.join(os.homedir(), '.geeto', 'opencode-zen')
const OPENCODE_ZEN_ENVIRONMENT = {
  XDG_CONFIG_HOME: path.join(OPENCODE_ZEN_RUNTIME_ROOT, 'config'),
  XDG_DATA_HOME: path.join(OPENCODE_ZEN_RUNTIME_ROOT, 'data'),
  XDG_CACHE_HOME: path.join(OPENCODE_ZEN_RUNTIME_ROOT, 'cache'),
  XDG_STATE_HOME: path.join(OPENCODE_ZEN_RUNTIME_ROOT, 'state'),
}
const OPENCODE_LOCAL_BINARY = fileURLToPath(
  new URL('../../node_modules/.bin/opencode', import.meta.url)
)
const OPENCODE_ZEN_PORT = 49217
let openCodeEnvironmentLock = Promise.resolve()

const withIsolatedOpenCodeEnvironment = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previousLock = openCodeEnvironmentLock
  let releaseLock = (): void => {}
  openCodeEnvironmentLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  await previousLock

  const previousEnvironment = new Map<string, string | undefined>([
    ['PATH', process.env.PATH],
    ...Object.keys(OPENCODE_ZEN_ENVIRONMENT).map((key) => [key, process.env[key]] as const),
  ])

  try {
    fs.mkdirSync(OPENCODE_ZEN_RUNTIME_ROOT, { recursive: true })
    for (const directory of Object.values(OPENCODE_ZEN_ENVIRONMENT)) {
      fs.mkdirSync(directory, { recursive: true })
    }
    process.env.PATH = [path.dirname(OPENCODE_LOCAL_BINARY), process.env.PATH]
      .filter(Boolean)
      .join(path.delimiter)
    for (const [key, value] of Object.entries(OPENCODE_ZEN_ENVIRONMENT)) {
      process.env[key] = value
    }
    return await operation()
  } finally {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    releaseLock()
  }
}

const startRuntime = async (): Promise<OpenCodeRuntime | null> => {
  try {
    return await withIsolatedOpenCodeEnvironment(async () => {
      const server = await createOpencode({ port: OPENCODE_ZEN_PORT, timeout: 5000 })
      const client = createOpencodeClient({
        baseUrl: server.server.url,
        directory: process.cwd(),
      })
      return { client, close: server.server.close }
    })
  } catch (error) {
    log.warn(`OpenCode Zen unavailable: ${String(error)}`)
    return null
  }
}

const getModelParts = (
  model?: OpenCodeModel
): { providerID: string; modelID: string } | undefined => {
  const value = model?.trim()
  if (!value) return undefined
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) {
    return { providerID: OPENCODE_ZEN_PROVIDER_ID, modelID: value }
  }
  const providerID = value.slice(0, separator)
  if (providerID !== OPENCODE_ZEN_PROVIDER_ID) return undefined
  return { providerID, modelID: value.slice(separator + 1) }
}

type ModelPricing = {
  cost?: {
    input: number
    output: number
    cache?: {
      read: number
      write: number
    }
  }
}

const isFreeModel = (model: ModelPricing): boolean =>
  model.cost?.input === 0 &&
  model.cost.output === 0 &&
  model.cost.cache?.read === 0 &&
  model.cost.cache.write === 0

const getZenProviderState = async (client: OpencodeClient) => {
  const result = await client.provider.list()
  if (result.error || !result.data) return

  const provider = result.data.all.find((item) => item.id === OPENCODE_ZEN_PROVIDER_ID)
  if (!provider) return

  return {
    provider,
    hasValidApiKey:
      result.data.connected.includes(OPENCODE_ZEN_PROVIDER_ID) && isOpenCodeZenApiKeyValidated(),
  }
}

const validateOpenCodeZenApiKey = async (client: OpencodeClient): Promise<boolean> => {
  const providerResult = await client.provider.list()
  const provider = providerResult.data?.all.find((item) => item.id === OPENCODE_ZEN_PROVIDER_ID)
  const validationModel = provider
    ? Object.values(provider.models).find((model) => !isFreeModel(model))
    : undefined
  if (!validationModel) return false

  const session = await client.session.create({
    body: { title: 'Geeto OpenCode Zen API key validation' },
  })
  if (session.error || !session.data?.id) return false

  try {
    const result = await client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: { providerID: OPENCODE_ZEN_PROVIDER_ID, modelID: validationModel.id },
        parts: [{ type: 'text', text: 'Reply with OK.' }],
      },
    })
    return !result.error
  } finally {
    await client.session.delete({ path: { id: session.data.id } }).catch(() => {})
  }
}

const resolveZenModel = async (
  client: OpencodeClient,
  model?: OpenCodeModel
): Promise<{ providerID: string; modelID: string } | undefined> => {
  const parsed = getModelParts(model)
  if (model && !parsed) {
    log.warn(`OpenCode Zen only: unsupported model provider in ${model}`)
    return undefined
  }

  const state = await getZenProviderState(client)
  if (!state) return undefined

  if (parsed) {
    const selected = state.provider.models[parsed.modelID]
    if (!selected || (!state.hasValidApiKey && !isFreeModel(selected))) {
      log.warn('OpenCode Zen paid models require a valid API key')
      return undefined
    }
    return parsed
  }

  const models = Object.values(state.provider.models).filter(
    (item) => state.hasValidApiKey || isFreeModel(item)
  )
  const selected = models.find((item) => isFreeModel(item)) ?? models[0]
  return selected ? { providerID: OPENCODE_ZEN_PROVIDER_ID, modelID: selected.id } : undefined
}

const runPrompt = async (prompt: string, model?: OpenCodeModel): Promise<string | null> => {
  const runtime = await startRuntime()
  if (!runtime) return null

  try {
    const modelParts = await resolveZenModel(runtime.client, model)
    if (!modelParts) {
      log.warn('OpenCode Zen provider has no available models')
      return null
    }

    const session = await runtime.client.session.create({
      body: { title: 'Geeto AI generation' },
    })
    if (session.error || !session.data?.id) return null

    const result = await runtime.client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: modelParts,
        parts: [{ type: 'text', text: prompt }],
      },
    })
    if (result.error) return null

    return (
      result.data.parts
        .filter((part): part is TextPart => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim() || null
    )
  } catch (error) {
    log.warn(`OpenCode Zen error: ${String(error)}`)
    return null
  } finally {
    runtime.close()
  }
}

export const isAvailable = (): boolean => {
  try {
    execFileSync(OPENCODE_LOCAL_BINARY, ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export const setOpenCodeZenApiKey = async (apiKey: string): Promise<boolean> => {
  const runtime = await startRuntime()
  if (!runtime) return false

  try {
    const result = await runtime.client.auth.set({
      path: { id: OPENCODE_ZEN_PROVIDER_ID },
      body: { type: 'api', key: apiKey },
    })
    if (result.error) {
      setOpenCodeZenApiKeyValidated(false)
      return false
    }

    const valid = await validateOpenCodeZenApiKey(runtime.client)
    setOpenCodeZenApiKeyValidated(valid)
    return valid
  } catch (error) {
    setOpenCodeZenApiKeyValidated(false)
    log.warn(`OpenCode Zen API key validation failed: ${String(error)}`)
    return false
  } finally {
    runtime.close()
  }
}

export const useFreeOpenCodeZenModels = (): void => {
  setOpenCodeZenApiKeyValidated(false)
}

export const generateBranchName = async (
  text: string,
  correction?: string,
  model?: OpenCodeModel
): Promise<string | null> => {
  const content = await runPrompt(
    buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction),
    model
  )
  return content ? normalizeBranchName(content.split('\n').find(Boolean) ?? '') || null : null
}

export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: OpenCodeModel
): Promise<string | null> => {
  const content = await runPrompt(buildCommitPrompt(diff, correction), model)
  return content
    ? cleanAIContent(content, { normalizeBlankLines: true, minLength: MIN_AI_RESPONSE_LENGTH })
    : null
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model?: OpenCodeModel
): Promise<string | null> => {
  const content = await runPrompt(buildReleaseNotesPrompt(commits, language, correction), model)
  return content ? cleanAIContent(content) : null
}

export const generateText = async (prompt: string, model?: OpenCodeModel): Promise<string | null> =>
  runPrompt(prompt, model)

export const getOpenCodeModels = async (): Promise<OpenCodeModelChoice[]> => {
  const runtime = await startRuntime()
  if (!runtime) return []

  try {
    const state = await getZenProviderState(runtime.client)
    if (!state) return []

    const models = Object.values(state.provider.models)
      .filter((model) => state.hasValidApiKey || isFreeModel(model))
      .map((model) => ({
        label: `OpenCode Zen / ${model.name}`,
        value: `${OPENCODE_ZEN_PROVIDER_ID}/${model.id}`,
        isFree: isFreeModel(model),
      }))

    const favoritesPath = `${process.cwd()}/.geeto/opencode-model.json`
    try {
      const favorites = JSON.parse(
        await import('node:fs/promises').then((fs) => fs.readFile(favoritesPath, 'utf8'))
      ) as Array<{ label?: string; value?: string }>
      const favoriteValues = new Set(favorites.map((model) => model.value).filter(Boolean))
      const savedModels = models.filter((model) => favoriteValues.has(model.value))
      if (savedModels.length > 0) return savedModels
    } catch {
      // No saved favorites; use all configured OpenCode Zen models.
    }

    return models
  } catch (error) {
    log.warn(`OpenCode Zen model discovery failed: ${String(error)}`)
    return []
  } finally {
    runtime.close()
  }
}
