import { getBranchStrategyConfig, getCommitConfig } from './config.js'
import { loadPrompt } from './prompt-loader.js'

/** Minimum length for AI-generated responses to be considered valid. */
export const MIN_AI_RESPONSE_LENGTH = 8

/**
 * Clean AI response content by removing fenced code blocks and surrounding quotes.
 * Optionally normalizes consecutive blank lines and enforces a minimum length.
 */
export const cleanAIContent = (
  content: string,
  options?: { normalizeBlankLines?: boolean; minLength?: number }
): string | null => {
  const cleaned = String(content)
    .replaceAll(/```[\S\s]*?```/g, '')
    .replaceAll(/^"+|"+$/g, '')
    .trim()

  if (options?.normalizeBlankLines) {
    const normalized = cleaned.replaceAll(/\n\s*\n+/g, '\n\n').trim()
    const min = options.minLength ?? 0
    return normalized && normalized.length >= min ? normalized : null
  }

  return cleaned || null
}

/**
 * Normalize text into a short kebab-case branch name suffix (max 25 chars).
 */
export const normalizeBranchName = (text: string): string => {
  const cleaned = String(text)
    .toLowerCase()
    .replaceAll(/[^\d\sa-z-]/g, ' ')
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')

  // Apply maxWords from branch config
  const config = getBranchStrategyConfig()
  const maxWords = config?.maxWords ?? 3
  const words = cleaned.split('-')
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join('-')
  }

  if (cleaned.length <= 25) return cleaned
  // Truncate at last word boundary within 25 chars
  const truncated = cleaned.slice(0, 25)
  const lastDash = truncated.lastIndexOf('-')
  return lastDash > 5 ? truncated.slice(0, lastDash) : truncated
}

/**
 * Build an AI prompt from a template file with optional correction/adjustment.
 */
export const buildPromptWithCorrection = (
  promptFile: string,
  input: string,
  inputLabel: string,
  correction?: string
): string => {
  const promptBase = loadPrompt(promptFile)
  return correction
    ? `${promptBase}\n\n${inputLabel}:\n${input}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\n${inputLabel}:\n${input}`
}

/**
 * Build a commit message prompt with user's style config applied.
 */
export const buildCommitPrompt = (diff: string, correction?: string): string => {
  const config = getCommitConfig()
  const prompt = buildPromptWithCorrection('commit-message-prompt.md', diff, 'Diff', correction)

  const style = config?.style ?? 'multiline'
  const subjectLength = config?.subjectLength ?? 72
  const tone = config?.tone ?? 'technical'

  const body =
    style === 'singleline'
      ? 'Output ONLY the subject line — no body, no blank line after subject.'
      : 'Wrap body lines at ~72 characters. Body max 360 chars. Separate subject and body by a single blank line.'

  const toneMap: Record<string, string> = {
    technical:
      'Use precise, specific language with proper conventional commit format (type(scope): subject).',
    concise: 'Keep it short and compact — minimal words, maximum signal.',
    descriptive: 'Write naturally and explain the change thoroughly — why, what, and how.',
  }

  return `${prompt}\n\n${body}\nSubject must be max ${subjectLength} characters.\n${toneMap[tone] ?? toneMap.technical}`
}

/**
 * Build a release notes prompt with language label substitution.
 */
export const buildReleaseNotesPrompt = (
  commits: string,
  language: string,
  correction?: string
): string => {
  const langLabel = language === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'
  const promptBase = loadPrompt('release-notes-prompt.md').replaceAll('{{langLabel}}', langLabel)
  return correction
    ? `${promptBase}\n\nCommits:\n${commits}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\nCommits:\n${commits}`
}
