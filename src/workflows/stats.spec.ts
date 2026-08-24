import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import { getMonthlyActivity } from './stats.js'

type CommandRunner = (command: string) => string

const fixtureEnvironment = {
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'Fixture Author',
}

const temporaryFixtures: string[] = []

const runGit = (
  cwd: string,
  args: string[],
  extraEnvironment: Record<string, string> = {}
): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...fixtureEnvironment, ...extraEnvironment },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()

const createGitFixture = (commits: Array<[date: string, message: string]>): string => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'geeto-stats-'))
  temporaryFixtures.push(cwd)
  runGit(cwd, ['init', '-q'])

  for (const [date, message] of commits) {
    runGit(cwd, ['commit', '--allow-empty', '-m', message], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    })
  }

  return cwd
}

const runGitCommand =
  (cwd: string): CommandRunner =>
  (command) => {
    const args = command
      .split(' ')
      .slice(1)
      .map((argument) => argument.replaceAll('"', ''))
    return runGit(cwd, args)
  }

const legacyMonthlyActivity = (now: Date, runCommand: CommandRunner) => {
  const months: Array<{ month: string; count: number }> = []
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const timezoneOffset =
    sign +
    String(Math.floor(absoluteMinutes / 60)).padStart(2, '0') +
    String(absoluteMinutes % 60).padStart(2, '0')
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const after = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01T${time}${timezoneOffset}`
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1)
    const before = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01T${time}${timezoneOffset}`

    let count = 0
    try {
      count =
        Number.parseInt(
          runCommand(`git rev-list --count --after="${after}" --before="${before}" HEAD`).trim(),
          10
        ) || 0
    } catch {
      // Keep the legacy workflow's best-effort behavior as the comparison baseline.
    }

    months.push({ month: date.toLocaleString('en', { month: 'short' }), count })
  }

  return months
}

const withTimezone = <T>(timezone: string, callback: () => T): T => {
  const previousTimezone = process.env.TZ
  process.env.TZ = timezone

  try {
    return callback()
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
}

afterEach(() => {
  for (const cwd of temporaryFixtures.splice(0)) {
    rmSync(cwd, { force: true, recursive: true })
  }
})

describe('getMonthlyActivity', () => {
  it('matches known fixture counts and reduces Git launches to one', () => {
    const cwd = createGitFixture([
      ['2024-09-30T12:00:00-0700', 'outside-before'],
      ['2024-10-01T00:00:00-0700', 'oldest-boundary'],
      ['2024-10-15T12:00:00-0700', 'october-1'],
      ['2024-10-31T23:59:59-0700', 'october-2'],
      ['2024-11-01T00:00:00-0700', 'november-boundary'],
      ['2024-11-12T12:00:00-0800', 'november-1'],
      ['2024-12-05T12:00:00-0800', 'december-1'],
      ['2025-01-01T00:00:00-0800', 'january-boundary'],
      ['2025-02-14T12:00:00-0800', 'february-1'],
      ['2025-03-01T00:00:00-0800', 'march-boundary'],
      ['2025-03-01T07:30:00+0000', 'february-in-los-angeles'],
      ['2025-03-01T00:00:01-0800', 'march-1'],
      ['2025-06-30T23:59:59-0700', 'june-1'],
      ['2025-09-01T00:00:00-0700', 'august-boundary'],
      ['2025-09-15T12:00:00-0700', 'september-1'],
      ['2025-10-02T12:00:00-0700', 'outside-after'],
    ])
    const now = new Date('2025-09-15T12:00:00-0700')
    const expected = [
      { month: 'Oct', count: 3 },
      { month: 'Nov', count: 1 },
      { month: 'Dec', count: 2 },
      { month: 'Jan', count: 0 },
      { month: 'Feb', count: 4 },
      { month: 'Mar', count: 0 },
      { month: 'Apr', count: 0 },
      { month: 'May', count: 0 },
      { month: 'Jun', count: 1 },
      { month: 'Jul', count: 0 },
      { month: 'Aug', count: 1 },
      { month: 'Sep', count: 1 },
    ]

    withTimezone('America/Los_Angeles', () => {
      const legacyCommands: string[] = []
      const optimizedCommands: string[] = []
      const commandRunner = runGitCommand(cwd)
      const legacy = legacyMonthlyActivity(now, (command) => {
        legacyCommands.push(command)
        return commandRunner(command)
      })
      const optimized = getMonthlyActivity(now, (command: string) => {
        optimizedCommands.push(command)
        return commandRunner(command)
      })

      expect(legacy).toEqual(expected)
      expect(optimized).toEqual(expected)
      expect(optimized).toEqual(legacy)
      expect(legacyCommands).toHaveLength(12)
      expect(optimizedCommands).toHaveLength(1)
      expect(optimizedCommands[0]).toContain('--format=%ct')
      expect(optimizedCommands[0]).toContain('--no-commit-header')
    })
  })

  it('keeps local-time month boundaries across timezones', () => {
    const cwd = createGitFixture([
      ['2025-09-01T10:30:00+0000', 'utc-before-local-month'],
      ['2025-09-01T11:30:00+0000', 'utc-after-local-month'],
    ])
    const now = new Date('2025-09-15T12:00:00')

    const cases = [
      { timezone: 'America/Los_Angeles', august: 2, september: 0 },
      { timezone: 'Asia/Jakarta', august: 0, september: 2 },
    ]

    for (const { timezone, august, september } of cases) {
      withTimezone(timezone, () => {
        const commandRunner = runGitCommand(cwd)
        const legacy = legacyMonthlyActivity(now, commandRunner)
        const optimized = getMonthlyActivity(now, commandRunner)

        expect(optimized).toEqual(legacy)
        expect(optimized.find(({ month }) => month === 'Aug')?.count).toBe(august)
        expect(optimized.find(({ month }) => month === 'Sep')?.count).toBe(september)
      })
    }
  })
})
