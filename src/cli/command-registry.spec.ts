import type { ModuleCommandDescriptor } from './command-registry.js'
import { describe, expect, test } from 'bun:test'

import {
  buildValidFlags,
  COMMAND_REGISTRY,
  executeRegisteredCommand,
  parseArgs,
  renderHelpMessage,
} from './command-registry.js'

const stripAnsi = (value: string): string => value.replaceAll(/\u001B\[[0-9;]*m/g, '')

const expectedHelpEntries: Array<readonly [string, string]> = [
  ['-s,  --stage', 'Stage files interactively'],
  ['-sa, -as', 'Stage all changes automatically'],
  ['-c,  --commit', 'Create a commit with AI message'],
  ['-b,  --branch', 'Create a branch with AI name'],
  ['-p,  --push', 'Push current branch to remote'],
  ['-m,  --merge', 'Merge branches interactively'],
  ['-cl, --cleanup', 'Clean up local & remote branches'],
  ['-sw, --switch', 'Switch branches with fuzzy search'],
  ['-cmp, --compare', 'Compare current branch with another'],
  ['-cp, --cherry-pick', 'Cherry-pick from another branch'],
  ['-lg, --log', 'View commit history with timeline'],
  ['-sh, --stash', 'Manage stashes interactively'],
  ['-am, --amend', 'Amend the last commit'],
  ['-u,  --undo', 'Undo the last git action safely'],
  ['-rv, --revert', 'Revert the last commit (soft reset)'],
  ['-al, --alias', 'Install shell aliases for geeto'],
  ['-rw, --reword', 'Edit past commit messages'],
  ['-sts, --stats', 'Repository statistics dashboard'],
  ['-sm, --submodules', 'Manage git submodules'],
  ['     --abort', 'Abort in-progress operation'],
  ['-pl, --pull', 'Pull from remote interactively'],
  ['-ft, --fetch', 'Fetch latest from remote'],
  ['     --prune', 'Remove stale remote branches'],
  ['-st, --status', 'Pretty git status overview'],
  ['-pr, --pr', 'Create a Pull Request / Merge Request'],
  ['-rvp, --review-pr', 'Review and comment Pull Request / Merge Request with AI'],
  ['-rvi, --review-issue', 'Review and comment Issue with AI'],
  ['-i,  --issue', 'Create an Issue'],
  ['-t,  --tag', 'Release & tag manager with semver'],
  ['-rp, --repo', 'Update repo settings'],
  ['-tr, --trello', 'Open Trello menu'],
  ['-tg, --trello-generate', 'Generate tasks from Trello'],
  ['     --setup-gemini', 'Configure Gemini AI'],
  ['     --setup-openrouter', 'Configure OpenRouter AI'],
  ['     --setup-groq', 'Configure Groq AI'],
  ['     --setup-codex', 'Configure OpenAI Codex'],
  ['     --setup-opencode', 'Check OpenCode Zen CLI availability'],
  ['     --setup-github', 'Configure GitHub token'],
  ['     --setup-gitlab', 'Configure GitLab token'],
  ['     --setup-trello', 'Configure Trello integration'],
  ['     --change-model', 'Switch AI provider / model'],
  ['     --sync-models', 'Fetch latest model list'],
  ['     --separator', 'Set branch name separator'],
  ['-f,  --fresh', 'Start fresh (ignore checkpoint)'],
  ['-r,  --resume', 'Resume from last checkpoint'],
  ['-dr, --dry-run', 'Simulate commands without executing'],
  ['-v,  --version', 'Show version'],
  ['-h,  --help', 'Show this help message'],
  ['     --where', 'Show installation path & method'],
  ['     --uninstall', 'Uninstall geeto CLI'],
  ['-up, --update', 'Update geeto to the latest version'],
]

const expectedHelpSections = [
  'WORKFLOW',
  'GIT TOOLS',
  'GITHUB / GITLAB',
  'TRELLO',
  'SETTINGS',
  'OPTIONS',
  'INFO',
  'UPDATE',
] as const

describe('command registry contract', () => {
  test('derives valid flags from the same descriptors used by help', () => {
    const expectedFlags = new Set(
      expectedHelpEntries.flatMap(([label]) =>
        label
          .trim()
          .split(',')
          .map((token) => token.trim())
      )
    )

    expect(buildValidFlags()).toEqual(expectedFlags)
    expect(
      COMMAND_REGISTRY.flatMap((command) => [command.flag, command.alias].filter(Boolean))
    ).toHaveLength(expectedFlags.size)
  })

  test('preserves the established help entries and ordering', () => {
    const help = stripAnsi(renderHelpMessage('0.0.0'))
    const lines = help.split('\n')
    const actualEntries = lines
      .filter((line) => line.startsWith('    ') && !line.includes('[command]'))
      .map((line) => [line.slice(4, 30).trimEnd(), line.slice(30)] as const)
    const actualSections = lines
      .filter((line) => line.startsWith('  ') && !line.startsWith('    '))
      .map((line) => line.slice(2))

    expect(actualEntries).toEqual(expectedHelpEntries)
    expect(actualSections).toEqual([
      'Geeto CLI v0.0.0',
      'Git flow automation with AI-powered workflows',
      'USAGE',
      ...expectedHelpSections,
    ])
  })

  test('parses registry aliases and passes positional arguments through', () => {
    const args = parseArgs(['-cl', '-c', '--dry-run', 'dynamic-value'])

    expect(args.activeFlags).toEqual(new Set(['--cleanup']))
    expect(args.startAt).toBe('commit')
    expect(args.dryRunMode).toBe(true)
    expect(args.positionals).toEqual(['dynamic-value'])
  })

  test('every registered module has a loader and callable handler', async () => {
    const moduleCommands = COMMAND_REGISTRY.filter(
      (command): command is ModuleCommandDescriptor => command.kind === 'module'
    )

    for (const command of moduleCommands) {
      expect(typeof command.loader).toBe('function')
      const module = await command.loader()
      expect(typeof module[command.handler]).toBe('function')
    }
  })

  test('dynamic handler arguments use the shared execution path', async () => {
    const received: string[] = []
    const command: ModuleCommandDescriptor = {
      kind: 'module',
      flag: '--test-command',
      module: './test-command.js',
      handler: 'run',
      errorLabel: 'Test command',
      loader: () =>
        Promise.resolve({
          run: (...args: string[]) => received.push(...args),
        }),
      help: {
        section: 'INFO',
        sectionOrder: 7,
        order: 99,
        description: 'Test command',
      },
    }

    await executeRegisteredCommand(command, ['first', 'second'])

    expect(received).toEqual(['first', 'second'])
  })
})
