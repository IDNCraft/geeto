export type StartAt = 'commit' | 'merge' | 'branch' | 'stage' | 'push'

type HelpSection =
  | 'WORKFLOW'
  | 'GIT TOOLS'
  | 'GITHUB / GITLAB'
  | 'TRELLO'
  | 'SETTINGS'
  | 'OPTIONS'
  | 'INFO'
  | 'UPDATE'

type Modifier = 'fresh' | 'resume' | 'version' | 'help' | 'dry-run'

interface HelpDescriptor {
  section: HelpSection
  sectionOrder: number
  order: number
  description: string
  label?: string
}

export type CommandModule = Record<string, unknown>
export type CommandLoader = () => Promise<CommandModule>

interface BaseCommandDescriptor {
  flag: string
  alias?: string
  help: HelpDescriptor
}

export interface ModuleCommandDescriptor extends BaseCommandDescriptor {
  kind: 'module'
  module: string
  handler: string
  errorLabel: string
  loader: CommandLoader
}

interface StartAtCommandDescriptor extends BaseCommandDescriptor {
  kind: 'start-at'
  startAt: StartAt
}

interface ModifierCommandDescriptor extends BaseCommandDescriptor {
  kind: 'modifier'
  modifier: Modifier
}

interface CompoundCommandDescriptor extends BaseCommandDescriptor {
  kind: 'compound'
  startAt: 'stage'
  stageAll: true
}

export type CommandDescriptor =
  | ModuleCommandDescriptor
  | StartAtCommandDescriptor
  | ModifierCommandDescriptor
  | CompoundCommandDescriptor

const moduleCommand = (
  command: Omit<ModuleCommandDescriptor, 'kind'>
): ModuleCommandDescriptor => ({
  kind: 'module',
  ...command,
})

/**
 * Single source of truth for CLI flags, aliases, help, loaders, and dispatch.
 * Array order preserves the existing first-match dispatch priority.
 */
export const COMMAND_REGISTRY = [
  // Git tools
  moduleCommand({
    flag: '--abort',
    module: './workflows/abort.js',
    handler: 'handleAbort',
    errorLabel: 'Abort',
    loader: () => import('../workflows/abort.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 14,
      description: 'Abort in-progress operation',
    },
  }),
  moduleCommand({
    flag: '--pull',
    alias: '-pl',
    module: './workflows/pull.js',
    handler: 'handlePull',
    errorLabel: 'Pull',
    loader: () => import('../workflows/pull.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 15,
      description: 'Pull from remote interactively',
    },
  }),
  moduleCommand({
    flag: '--prune',
    module: './workflows/prune.js',
    handler: 'handlePrune',
    errorLabel: 'Prune',
    loader: () => import('../workflows/prune.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 17,
      description: 'Remove stale remote branches',
    },
  }),
  moduleCommand({
    flag: '--fetch',
    alias: '-ft',
    module: './workflows/fetch.js',
    handler: 'handleFetch',
    errorLabel: 'Fetch',
    loader: () => import('../workflows/fetch.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 16,
      description: 'Fetch latest from remote',
    },
  }),
  moduleCommand({
    flag: '--status',
    alias: '-st',
    module: './workflows/status.js',
    handler: 'handleStatus',
    errorLabel: 'Status',
    loader: () => import('../workflows/status.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 18,
      description: 'Pretty git status overview',
    },
  }),
  moduleCommand({
    flag: '--revert',
    alias: '-rv',
    module: './workflows/revert.js',
    handler: 'handleRevert',
    errorLabel: 'Revert',
    loader: () => import('../workflows/revert.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 9,
      description: 'Revert the last commit (soft reset)',
    },
  }),
  moduleCommand({
    flag: '--alias',
    alias: '-al',
    module: './workflows/alias.js',
    handler: 'handleAlias',
    errorLabel: 'Alias',
    loader: () => import('../workflows/alias.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 10,
      description: 'Install shell aliases for geeto',
    },
  }),
  moduleCommand({
    flag: '--reword',
    alias: '-rw',
    module: './workflows/reword.js',
    handler: 'handleReword',
    errorLabel: 'Reword',
    loader: () => import('../workflows/reword.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 11,
      description: 'Edit past commit messages',
    },
  }),
  moduleCommand({
    flag: '--cleanup',
    alias: '-cl',
    module: './workflows/cleanup.js',
    handler: 'handleInteractiveCleanup',
    errorLabel: 'Cleanup',
    loader: () => import('../workflows/cleanup.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 1,
      description: 'Clean up local & remote branches',
    },
  }),
  moduleCommand({
    flag: '--switch',
    alias: '-sw',
    module: './workflows/switch.js',
    handler: 'handleBranchSwitch',
    errorLabel: 'Switch',
    loader: () => import('../workflows/switch.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 2,
      description: 'Switch branches with fuzzy search',
    },
  }),
  moduleCommand({
    flag: '--compare',
    alias: '-cmp',
    module: './workflows/compare.js',
    handler: 'handleBranchCompare',
    errorLabel: 'Compare',
    loader: () => import('../workflows/compare.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 3,
      description: 'Compare current branch with another',
    },
  }),
  moduleCommand({
    flag: '--cherry-pick',
    alias: '-cp',
    module: './workflows/cherry-pick.js',
    handler: 'handleCherryPick',
    errorLabel: 'Cherry-pick',
    loader: () => import('../workflows/cherry-pick.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 4,
      description: 'Cherry-pick from another branch',
    },
  }),
  // GitHub / GitLab
  moduleCommand({
    flag: '--pr',
    alias: '-pr',
    module: './workflows/pr.js',
    handler: 'handleCreatePR',
    errorLabel: 'PR',
    loader: () => import('../workflows/pr.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 1,
      description: 'Create a Pull Request / Merge Request',
    },
  }),
  moduleCommand({
    flag: '--review-pr',
    alias: '-rvp',
    module: './workflows/review-pr.js',
    handler: 'handleReviewPR',
    errorLabel: 'Review PR',
    loader: () => import('../workflows/review-pr.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 2,
      description: 'Review and comment Pull Request / Merge Request with AI',
    },
  }),
  moduleCommand({
    flag: '--review-issue',
    alias: '-rvi',
    module: './workflows/review-issue.js',
    handler: 'handleReviewIssue',
    errorLabel: 'Review Issue',
    loader: () => import('../workflows/review-issue.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 3,
      description: 'Review and comment Issue with AI',
    },
  }),
  moduleCommand({
    flag: '--issue',
    alias: '-i',
    module: './workflows/issue.js',
    handler: 'handleCreateIssue',
    errorLabel: 'Issue',
    loader: () => import('../workflows/issue.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 4,
      description: 'Create an Issue',
    },
  }),
  // History and repository tools
  moduleCommand({
    flag: '--log',
    alias: '-lg',
    module: './workflows/history.js',
    handler: 'handleHistory',
    errorLabel: 'History',
    loader: () => import('../workflows/history.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 5,
      description: 'View commit history with timeline',
    },
  }),
  moduleCommand({
    flag: '--stash',
    alias: '-sh',
    module: './workflows/stash.js',
    handler: 'handleStash',
    errorLabel: 'Stash',
    loader: () => import('../workflows/stash.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 6,
      description: 'Manage stashes interactively',
    },
  }),
  moduleCommand({
    flag: '--amend',
    alias: '-am',
    module: './workflows/amend.js',
    handler: 'handleAmend',
    errorLabel: 'Amend',
    loader: () => import('../workflows/amend.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 7,
      description: 'Amend the last commit',
    },
  }),
  moduleCommand({
    flag: '--stats',
    alias: '-sts',
    module: './workflows/stats.js',
    handler: 'handleStats',
    errorLabel: 'Stats',
    loader: () => import('../workflows/stats.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 12,
      description: 'Repository statistics dashboard',
    },
  }),
  moduleCommand({
    flag: '--undo',
    alias: '-u',
    module: './workflows/undo.js',
    handler: 'handleUndo',
    errorLabel: 'Undo',
    loader: () => import('../workflows/undo.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 8,
      description: 'Undo the last git action safely',
    },
  }),
  moduleCommand({
    flag: '--tag',
    alias: '-t',
    module: './workflows/release.js',
    handler: 'handleRelease',
    errorLabel: 'Release',
    loader: () => import('../workflows/release.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 5,
      description: 'Release & tag manager with semver',
    },
  }),
  moduleCommand({
    flag: '--repo',
    alias: '-rp',
    module: './workflows/repo-settings.js',
    handler: 'handleRepoSettings',
    errorLabel: 'Repo settings',
    loader: () => import('../workflows/repo-settings.js'),
    help: {
      section: 'GITHUB / GITLAB',
      sectionOrder: 3,
      order: 6,
      description: 'Update repo settings',
    },
  }),
  moduleCommand({
    flag: '--submodules',
    alias: '-sm',
    module: './workflows/submodules.js',
    handler: 'handleSubmodules',
    errorLabel: 'Submodules',
    loader: () => import('../workflows/submodules.js'),
    help: {
      section: 'GIT TOOLS',
      sectionOrder: 2,
      order: 13,
      description: 'Manage git submodules',
    },
  }),
  // Trello
  moduleCommand({
    flag: '--trello',
    alias: '-tr',
    module: './workflows/trello-menu.js',
    handler: 'showTrelloMenu',
    errorLabel: 'Trello menu',
    loader: () => import('../workflows/trello-menu.js'),
    help: {
      section: 'TRELLO',
      sectionOrder: 4,
      order: 1,
      description: 'Open Trello menu',
    },
  }),
  moduleCommand({
    flag: '--trello-generate',
    alias: '-tg',
    module: './workflows/trello-menu.js',
    handler: 'handleGenerateTaskInstructions',
    errorLabel: 'Trello generate',
    loader: () => import('../workflows/trello-menu.js'),
    help: {
      section: 'TRELLO',
      sectionOrder: 4,
      order: 2,
      description: 'Generate tasks from Trello',
    },
  }),
  // Settings
  moduleCommand({
    flag: '--separator',
    module: './workflows/settings.js',
    handler: 'handleSeparatorSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 11,
      description: 'Set branch name separator',
    },
  }),
  moduleCommand({
    flag: '--sync-models',
    module: './workflows/settings.js',
    handler: 'handleModelResetSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 10,
      description: 'Fetch latest model list',
    },
  }),
  moduleCommand({
    flag: '--change-model',
    module: './workflows/settings.js',
    handler: 'handleChangeModelSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 9,
      description: 'Switch AI provider / model',
    },
  }),
  moduleCommand({
    flag: '--setup-gemini',
    module: './workflows/settings.js',
    handler: 'handleGeminiSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 1,
      description: 'Configure Gemini AI',
    },
  }),
  moduleCommand({
    flag: '--setup-openrouter',
    module: './workflows/settings.js',
    handler: 'handleOpenRouterSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 2,
      description: 'Configure OpenRouter AI',
    },
  }),
  moduleCommand({
    flag: '--setup-trello',
    module: './workflows/settings.js',
    handler: 'handleTrelloSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 8,
      description: 'Configure Trello integration',
    },
  }),
  moduleCommand({
    flag: '--setup-groq',
    module: './workflows/settings.js',
    handler: 'handleGroqSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 3,
      description: 'Configure Groq AI',
    },
  }),
  moduleCommand({
    flag: '--setup-codex',
    module: './workflows/settings.js',
    handler: 'handleCodexSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 4,
      description: 'Configure OpenAI Codex',
    },
  }),
  moduleCommand({
    flag: '--setup-opencode',
    module: './workflows/settings.js',
    handler: 'handleOpenCodeSetting',
    errorLabel: 'Settings',
    loader: () => import('../workflows/settings.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 5,
      description: 'Check OpenCode Zen CLI availability',
    },
  }),
  moduleCommand({
    flag: '--setup-github',
    module: './core/github-setup.js',
    handler: 'setupGithubConfigInteractive',
    errorLabel: 'Settings',
    loader: () => import('../core/github-setup.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 6,
      description: 'Configure GitHub token',
    },
  }),
  moduleCommand({
    flag: '--setup-gitlab',
    module: './core/gitlab-setup.js',
    handler: 'setupGitlabConfigInteractive',
    errorLabel: 'Settings',
    loader: () => import('../core/gitlab-setup.js'),
    help: {
      section: 'SETTINGS',
      sectionOrder: 5,
      order: 7,
      description: 'Configure GitLab token',
    },
  }),
  // Doctor / info
  moduleCommand({
    flag: '--uninstall',
    module: './workflows/doctor.js',
    handler: 'handleUninstall',
    errorLabel: 'Uninstall',
    loader: () => import('../workflows/doctor.js'),
    help: {
      section: 'INFO',
      sectionOrder: 7,
      order: 2,
      description: 'Uninstall geeto CLI',
    },
  }),
  moduleCommand({
    flag: '--where',
    module: './workflows/doctor.js',
    handler: 'handleWhereInstalled',
    errorLabel: 'Where',
    loader: () => import('../workflows/doctor.js'),
    help: {
      section: 'INFO',
      sectionOrder: 7,
      order: 1,
      description: 'Show installation path & method',
    },
  }),
  // Update
  moduleCommand({
    flag: '--update',
    alias: '-up',
    module: './workflows/update.js',
    handler: 'handleUpdate',
    errorLabel: 'Update',
    loader: () => import('../workflows/update.js'),
    help: {
      section: 'UPDATE',
      sectionOrder: 8,
      order: 1,
      description: 'Update geeto to the latest version',
    },
  }),
  // Main workflow start points
  {
    kind: 'start-at',
    flag: '--commit',
    alias: '-c',
    startAt: 'commit',
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 3,
      description: 'Create a commit with AI message',
    },
  },
  {
    kind: 'start-at',
    flag: '--merge',
    alias: '-m',
    startAt: 'merge',
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 6,
      description: 'Merge branches interactively',
    },
  },
  {
    kind: 'start-at',
    flag: '--branch',
    alias: '-b',
    startAt: 'branch',
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 4,
      description: 'Create a branch with AI name',
    },
  },
  {
    kind: 'start-at',
    flag: '--stage',
    alias: '-s',
    startAt: 'stage',
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 1,
      description: 'Stage files interactively',
    },
  },
  {
    kind: 'start-at',
    flag: '--push',
    alias: '-p',
    startAt: 'push',
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 5,
      description: 'Push current branch to remote',
    },
  },
  {
    kind: 'compound',
    flag: '-sa',
    alias: '-as',
    startAt: 'stage',
    stageAll: true,
    help: {
      section: 'WORKFLOW',
      sectionOrder: 1,
      order: 2,
      description: 'Stage all changes automatically',
      label: '-sa, -as',
    },
  },
  // Modifiers
  {
    kind: 'modifier',
    flag: '--fresh',
    alias: '-f',
    modifier: 'fresh',
    help: {
      section: 'OPTIONS',
      sectionOrder: 6,
      order: 1,
      description: 'Start fresh (ignore checkpoint)',
    },
  },
  {
    kind: 'modifier',
    flag: '--resume',
    alias: '-r',
    modifier: 'resume',
    help: {
      section: 'OPTIONS',
      sectionOrder: 6,
      order: 2,
      description: 'Resume from last checkpoint',
    },
  },
  {
    kind: 'modifier',
    flag: '--version',
    alias: '-v',
    modifier: 'version',
    help: {
      section: 'OPTIONS',
      sectionOrder: 6,
      order: 4,
      description: 'Show version',
    },
  },
  {
    kind: 'modifier',
    flag: '--help',
    alias: '-h',
    modifier: 'help',
    help: {
      section: 'OPTIONS',
      sectionOrder: 6,
      order: 5,
      description: 'Show this help message',
    },
  },
  {
    kind: 'modifier',
    flag: '--dry-run',
    alias: '-dr',
    modifier: 'dry-run',
    help: {
      section: 'OPTIONS',
      sectionOrder: 6,
      order: 3,
      description: 'Simulate commands without executing',
    },
  },
] as const satisfies readonly CommandDescriptor[]

export interface ParsedArgs {
  startAt?: StartAt
  fresh: boolean
  resume: boolean
  stageAll: boolean
  dryRunMode: boolean
  showVersion: boolean
  showHelp: boolean
  /** Set of matched module command flags (by primary flag name). */
  activeFlags: Set<string>
  /** Positional arguments passed to a module handler by the shared policy. */
  positionals: string[]
}

export const getCommandTokens = (command: CommandDescriptor): string[] =>
  [command.flag, command.alias].filter((token): token is string => token !== undefined)

export function buildValidFlags(
  registry: readonly CommandDescriptor[] = COMMAND_REGISTRY
): Set<string> {
  return new Set(registry.flatMap((command) => getCommandTokens(command)))
}

export function parseArgs(
  argv: readonly string[],
  registry: readonly CommandDescriptor[] = COMMAND_REGISTRY
): ParsedArgs {
  let startAt: StartAt | undefined
  let fresh = false
  let resume = false
  let stageAll = false
  let dryRunMode = false
  let showVersion = false
  let showHelp = false
  const activeFlags = new Set<string>()
  const positionals: string[] = []

  for (const arg of argv) {
    const command = registry.find((entry) => entry.flag === arg || entry.alias === arg)
    if (!command) {
      if (!arg.startsWith('-')) positionals.push(arg)
      continue
    }

    if (command.kind === 'module') {
      activeFlags.add(command.flag)
    } else if (command.kind === 'start-at' || command.kind === 'compound') {
      startAt = command.startAt
      if (command.kind === 'compound') stageAll = command.stageAll
    } else {
      switch (command.modifier) {
        case 'fresh': {
          fresh = true
          break
        }
        case 'resume': {
          resume = true
          break
        }
        case 'version': {
          showVersion = true
          break
        }
        case 'help': {
          showHelp = true
          break
        }
        case 'dry-run': {
          dryRunMode = true
          break
        }
      }
    }
  }

  return {
    startAt,
    fresh,
    resume,
    stageAll,
    dryRunMode,
    showVersion,
    showHelp,
    activeFlags,
    positionals,
  }
}

const formatHelpLabel = (command: CommandDescriptor): string => {
  if (command.help.label) return command.help.label
  if (!command.alias) return `     ${command.flag}`

  const spacing = command.alias.length === 2 ? '  ' : ' '
  return `${command.alias},${spacing}${command.flag}`
}

export function renderHelpMessage(
  version: string,
  registry: readonly CommandDescriptor[] = COMMAND_REGISTRY
): string {
  const C = '\u001B[36m'
  const B = '\u001B[1m'
  const G = '\u001B[90m'
  const R = '\u001B[0m'
  const groups = new Map<HelpSection, { sectionOrder: number; commands: CommandDescriptor[] }>()

  for (const command of registry) {
    const group = groups.get(command.help.section)
    if (group) {
      group.commands.push(command)
    } else {
      groups.set(command.help.section, {
        sectionOrder: command.help.sectionOrder,
        commands: [command],
      })
    }
  }

  const lines = [
    '',
    `  ${B}Geeto CLI${R} ${G}v${version}${R}`,
    `  ${G}Git flow automation with AI-powered workflows${R}`,
    '',
    `  ${B}USAGE${R}`,
    `    ${C}geeto${R} ${G}[command] [options]${R}`,
  ]

  // eslint-disable-next-line unicorn/no-array-sort
  const sortedGroups = [...groups.entries()].sort(
    ([, left], [, right]) => left.sectionOrder - right.sectionOrder
  )
  for (const [section, group] of sortedGroups) {
    lines.push('', `  ${B}${section}${R}`)
    // eslint-disable-next-line unicorn/no-array-sort
    const commands = [...group.commands].sort((left, right) => left.help.order - right.help.order)
    for (const command of commands) {
      const label = formatHelpLabel(command)
      lines.push(
        `    ${C}${label}${R}${label.padEnd(26).slice(label.length)}${command.help.description}`
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}

/** Execute a dynamically loaded handler with the same positional-argument policy for every module command. */
export async function executeRegisteredCommand(
  command: ModuleCommandDescriptor,
  positionals: readonly string[] = []
): Promise<void> {
  const module = await command.loader()
  const handler = module[command.handler]
  if (typeof handler !== 'function') {
    throw new TypeError(`No handler ${command.handler} in ${command.module}`)
  }

  await (handler as (...args: string[]) => unknown)(...positionals)
}
