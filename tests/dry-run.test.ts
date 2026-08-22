import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import {
  getDryRunCommands,
  isMutatingCommand,
  isReadOnlyCommand,
  printDryRunSummary,
  setDryRun,
} from '../src/utils/dry-run.js'
import { exec, execAsync } from '../src/utils/exec.js'

let confirmCalls = 0

mock.module('../src/cli/input.js', () => ({
  askQuestion: (): string => '',
  confirm: (): boolean => {
    confirmCalls++
    return false
  },
  editMultiline: (): Promise<null> => Promise.resolve(null),
}))

const { attemptCommit } = await import('../src/workflows/commit.js')

const originalCwd = process.cwd()
const originalEnv = {
  DRY_RUN_API_STATE: process.env.DRY_RUN_API_STATE,
  DRY_RUN_FAKE_LOG: process.env.DRY_RUN_FAKE_LOG,
  GH_TOKEN: process.env.GH_TOKEN,
  PATH: process.env.PATH,
  REAL_GIT_PATH: process.env.REAL_GIT_PATH,
  TMPDIR: process.env.TMPDIR,
}
let tempRoot: string | undefined

const restoreEnv = (name: keyof typeof originalEnv): void => {
  const value = originalEnv[name]
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

afterEach(() => {
  setDryRun(false)
  process.chdir(originalCwd)
  for (const name of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
    restoreEnv(name)
  }
  if (tempRoot) rmSync(tempRoot, { force: true, recursive: true })
  tempRoot = undefined
  confirmCalls = 0
})

const runGit = (gitPath: string, cwd: string, ...args: string[]): string => {
  const result = Bun.spawnSync([gitPath, ...args], {
    cwd,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString())
  }
  return result.stdout.toString().trim()
}

describe('dry-run command classification', () => {
  test('treats fetch, filesystem cleanup, and release deletion as mutating', () => {
    const mutatingCommands = [
      'git fetch origin',
      'rm -rf ".git/modules/example"',
      'rmdir example',
      'gh release delete v1.2.3 --yes',
      'glab release delete v1.2.3 --yes',
    ]

    for (const command of mutatingCommands) {
      expect(isMutatingCommand(command)).toBe(true)
    }
    expect(isReadOnlyCommand('git fetch origin')).toBe(false)
    expect(isMutatingCommand('git status --short')).toBe(false)
    expect(isMutatingCommand('gh release list')).toBe(false)
  })
})

describe('dry-run side-effect isolation', () => {
  test('preserves repository, filesystem, and API state while recording safe intent', async () => {
    const gitPath = Bun.which('git')
    if (!gitPath) throw new Error('git is required for this test')

    tempRoot = mkdtempSync(path.join(tmpdir(), 'geeto-dry-run-'))
    const repo = path.join(tempRoot, 'repo')
    const fakeBin = path.join(tempRoot, 'fake-bin')
    const commitTemp = path.join(tempRoot, 'commit-temp')
    const fakeLog = path.join(tempRoot, 'fake-calls.log')
    const apiState = path.join(tempRoot, 'api-state.txt')
    mkdirSync(repo)
    mkdirSync(fakeBin)
    mkdirSync(commitTemp)

    runGit(gitPath, repo, 'init', '-q')
    runGit(gitPath, repo, 'config', 'user.name', 'Dry Run Test')
    runGit(gitPath, repo, 'config', 'user.email', 'dry-run@example.com')
    writeFileSync(path.join(repo, 'tracked.txt'), 'unchanged\n')
    runGit(gitPath, repo, 'add', 'tracked.txt')
    runGit(gitPath, repo, 'commit', '-qm', 'initial')
    runGit(gitPath, repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')

    const cleanupDir = path.join(repo, '.git', 'modules', 'example')
    const cleanupMarker = path.join(cleanupDir, 'keep.txt')
    mkdirSync(cleanupDir, { recursive: true })
    writeFileSync(cleanupMarker, 'keep\n')
    writeFileSync(apiState, 'published\n')

    const fakeCommand = (name: string, body: string): void => {
      const executable = path.join(fakeBin, name)
      writeFileSync(
        executable,
        `#!/bin/sh\nprintf '%s\\n' '${name} '"$*" >> "$DRY_RUN_FAKE_LOG"\n${body}\n`
      )
      Bun.spawnSync(['chmod', '+x', executable])
    }

    fakeCommand(
      'git',
      'if [ "$1" = "fetch" ]; then "$REAL_GIT_PATH" update-ref refs/remotes/origin/dry-run-mutated HEAD; fi'
    )
    fakeCommand('rm', '/bin/rm "$@"')
    fakeCommand('gh', String.raw`printf 'deleted\n' > "$DRY_RUN_API_STATE"`)

    process.env.DRY_RUN_API_STATE = apiState
    process.env.DRY_RUN_FAKE_LOG = fakeLog
    process.env.GH_TOKEN = 'ghp_dry_run_test_secret'
    process.env.PATH = `${fakeBin}:${originalEnv.PATH ?? ''}`
    process.env.REAL_GIT_PATH = gitPath
    process.env.TMPDIR = commitTemp
    process.chdir(repo)

    const snapshot = () => ({
      apiState: readFileSync(apiState, 'utf8'),
      cleanupMarker: existsSync(cleanupMarker) ? readFileSync(cleanupMarker, 'utf8') : null,
      head: runGit(gitPath, repo, 'rev-parse', 'HEAD'),
      index: runGit(gitPath, repo, 'write-tree'),
      remoteRefs: runGit(
        gitPath,
        repo,
        'for-each-ref',
        '--format=%(refname):%(objectname)',
        'refs/remotes'
      ),
      tempCommitFiles: readdirSync(commitTemp).filter((file) => file.startsWith('geeto-commit-')),
      workingTree: runGit(gitPath, repo, 'status', '--porcelain=v1', '--untracked-files=all'),
    })

    const before = snapshot()
    const commandStart = getDryRunCommands().length
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {})

    setDryRun(true)
    const committed = await attemptCommit(
      'fix: keep ghp_dry_run_test_secret private',
      'Do not expose ghp_dry_run_test_secret.'
    )
    await execAsync('git fetch origin', true)
    exec('rm -rf ".git/modules/example"', true)
    await execAsync('gh release delete v1.2.3 --yes', true)
    printDryRunSummary()

    const skippedCommands = getDryRunCommands().slice(commandStart)
    const summaryOutput = consoleSpy.mock.calls.flat().join('\n')
    consoleSpy.mockRestore()

    expect(committed).toBe(true)
    expect(confirmCalls).toBe(0)
    expect(snapshot()).toEqual(before)
    expect(existsSync(fakeLog)).toBe(false)
    expect(skippedCommands).toEqual([
      'git commit -F <temporary-message-file>',
      'git fetch origin',
      'rm -rf ".git/modules/example"',
      'gh release delete v1.2.3 --yes',
    ])
    expect(summaryOutput).toContain('git commit -F <temporary-message-file>')
    expect(summaryOutput).toContain('gh release delete v1.2.3 --yes')
    expect(summaryOutput).not.toContain('ghp_dry_run_test_secret')
  })
})
