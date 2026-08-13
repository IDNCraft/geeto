import type { GeminiModel } from '../api/gemini.js'
import type { GroqModel } from '../api/groq.js'
import type { OpenRouterModel } from '../api/openrouter.js'

export interface SelectOption {
  label: string
  value: string
  /** When true, item is shown but cannot be selected (e.g. separators). */
  disabled?: boolean
  /** Child values — toggling this item toggles all children (group header). */
  children?: string[]
}

export interface GeetoState {
  step: number
  workingBranch: string
  targetBranch: string
  currentBranch: string
  timestamp: string
  aiProvider?: 'gemini' | 'openrouter' | 'groq' | 'codex' | 'opencode-zen' | 'manual'
  openrouterModel?: OpenRouterModel
  geminiModel?: GeminiModel
  groqModel?: GroqModel
  codexModel?: string
  opencodeModel?: string
  // Flags for explicitly skipped steps
  skippedCommit?: boolean
  skippedPush?: boolean
}

export interface TrelloConfig {
  apiKey: string
  token: string
  boardId: string
}

export interface TrelloChecklistItem {
  id: string
  name: string
  state?: 'complete' | 'incomplete'
}

export interface TrelloChecklist {
  id: string
  name: string
  checkItems: TrelloChecklistItem[]
}

export interface TrelloLabel {
  id: string
  name: string
  color: string | null
}

export interface TrelloCard {
  id: string
  name: string
  desc?: string
  idShort: number
  shortLink: string
  url: string
  idList: string
  labels?: TrelloLabel[]
  checklists?: TrelloChecklist[]
}

export interface TrelloList {
  id: string
  name: string
}

export interface BranchStrategyConfig {
  separator: '-' | '_'
  prefixSeparator?: '#' | '/'
  lastNamingStrategy?: 'title-full' | 'title-ai' | 'ai' | 'trello' | 'manual'
  lastTrelloList?: string // Last selected Trello list ID
  protectedBranches?: string[] // Custom protected branches (beyond defaults)
  allowedBases?: string[] // Custom base branches allowed for branching (no warning)
  projectTool?: TaskPlatform // Project management tool for issue ID linking
  maxWords?: number // Max words in generated branch name (1-3)
}

export type TaskPlatform = 'trello' | 'none'

export interface GeminiConfig {
  apiKey: string
}

export interface OpenRouterConfig {
  apiKey: string
}

export interface GitHubConfig {
  token: string
}

export type Platform = 'github' | 'gitlab'

export interface GitLabConfig {
  token: string
  /** GitLab instance URL (default: https://gitlab.com) */
  url?: string
}

export type CommitStyle = 'singleline' | 'multiline'
export type CommitTone = 'technical' | 'concise' | 'descriptive'
export type SubjectLength = 50 | 72 | 100

export interface CommitConfig {
  style: CommitStyle
  subjectLength: SubjectLength
  tone?: CommitTone
}
