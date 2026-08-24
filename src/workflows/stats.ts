/**
 * Git Stats workflow
 * Repository statistics dashboard
 */

import { colors } from '../utils/colors.js'
import { execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Format a number with locale separators
 */
const fmt = (n: number): string => n.toLocaleString()

/**
 * Create a horizontal bar for visual stats
 */
const bar = (value: number, max: number, width = 20): string => {
  const filled = max > 0 ? Math.round((value / max) * width) : 0
  return `${colors.green}${'█'.repeat(filled)}${colors.gray}${'░'.repeat(width - filled)}${colors.reset}`
}

/**
 * Get basic repo info
 */
const getRepoInfo = (): {
  name: string
  totalCommits: number
  totalBranches: number
  remoteBranches: number
  tags: number
  firstCommitDate: string
  age: string
} => {
  const remoteUrl = execSilent('git config --get remote.origin.url').trim()
  const name =
    remoteUrl
      .replace(/\.git$/, '')
      .split('/')
      .pop() ?? remoteUrl

  const totalCommits = Number.parseInt(execSilent('git rev-list --count HEAD').trim(), 10) || 0
  const localBranches = execSilent('git branch --list').trim().split('\n').filter(Boolean).length
  const remoteBranches = execSilent('git branch -r --list')
    .trim()
    .split('\n')
    .filter(Boolean).length

  let tags = 0
  try {
    const tagOutput = execSilent('git tag --list').trim()
    tags = tagOutput ? tagOutput.split('\n').filter(Boolean).length : 0
  } catch {
    // no tags
  }

  let firstCommitDate = ''
  let age = ''
  try {
    firstCommitDate = execSilent('git log --reverse --format="%ci" | head -1').trim()
    const first = new Date(firstCommitDate)
    const now = new Date()
    const diffMs = now.getTime() - first.getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (days > 365) {
      const years = Math.floor(days / 365)
      const months = Math.floor((days % 365) / 30)
      age = `${years}y ${months}m`
    } else if (days > 30) {
      const months = Math.floor(days / 30)
      age = `${months}m ${days % 30}d`
    } else {
      age = `${days}d`
    }
  } catch {
    // no commits
  }

  return {
    name,
    totalCommits,
    totalBranches: localBranches,
    remoteBranches,
    tags,
    firstCommitDate,
    age,
  }
}

/**
 * Get top contributors (by commit count)
 */
const getTopContributors = (
  limit = 10
): Array<{ name: string; email: string; commits: number }> => {
  try {
    const output = execSilent('git shortlog -sne HEAD').trim()
    if (!output) return []
    return output
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+?)\s+<(.+?)>$/)
        if (!match) return null
        return {
          commits: Number.parseInt(match[1] ?? '0', 10),
          name: (match[2] ?? '').trim(),
          email: match[3] ?? '',
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  } catch {
    return []
  }
}

/**
 * Get commit activity (last 12 months)
 */
const formatTimezoneOffset = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')
  const minutes = String(absoluteMinutes % 60).padStart(2, '0')
  return `${sign}${hours}${minutes}`
}

const formatGitBoundary = (date: Date, time: string, timezoneOffset: string): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${time}${timezoneOffset}`

const getBoundaryTime = (date: Date, now: Date): number =>
  Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  ) +
  now.getTimezoneOffset() * 60 * 1000

export const getMonthlyActivity = (...args: unknown[]): Array<{ month: string; count: number }> => {
  const now = args[0] instanceof Date ? args[0] : new Date()
  const runCommand = typeof args[1] === 'function' ? (args[1] as typeof execSilent) : execSilent
  // Git date-only arguments inherit the current local clock and offset; snapshot both for parity.
  const timezoneOffset = formatTimezoneOffset(now)
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
  const months: Array<{
    month: string
    count: number
    after: string
    before: string
    afterTime: number
    beforeTime: number
  }> = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const after = formatGitBoundary(d, time, timezoneOffset)
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const before = formatGitBoundary(nextMonth, time, timezoneOffset)

    const monthName = d.toLocaleString('en', { month: 'short' })
    months.push({
      month: monthName,
      count: 0,
      after,
      before,
      // Git treats explicit --after boundaries as inclusive and --before boundaries as exclusive.
      afterTime: getBoundaryTime(d, now),
      beforeTime: getBoundaryTime(nextMonth, now),
    })
  }

  const firstMonth = months[0]
  const lastMonth = months.at(-1)
  if (!firstMonth || !lastMonth) return []

  let commitTimestamps = ''
  try {
    commitTimestamps = runCommand(
      `git rev-list --format=%ct --no-commit-header --after="${firstMonth.after}" --before="${lastMonth.before}" HEAD`
    ).trim()
  } catch {
    // skip
  }

  for (const line of commitTimestamps.split('\n')) {
    if (!line) continue
    const timestamp = Number(line)
    if (!Number.isFinite(timestamp)) continue

    const commitTime = timestamp * 1000
    const month = months.find(
      ({ afterTime, beforeTime }) => commitTime >= afterTime && commitTime < beforeTime
    )
    if (month) month.count++
  }

  return months.map(({ month, count }) => ({ month, count }))
}

/**
 * Get file type distribution
 */
const getFileTypes = (limit = 10): Array<{ ext: string; count: number }> => {
  try {
    const output = execSilent(
      String.raw`git ls-files | grep -o "\.[^./]*$" | sort | uniq -c | sort -rn`
    ).trim()
    if (!output) return []
    return output
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/)
        if (!match) return null
        return {
          count: Number.parseInt(match[1] ?? '0', 10),
          ext: match[2] ?? '',
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  } catch {
    return []
  }
}

/**
 * Get lines of code stats
 */
const getCodeStats = (): { totalFiles: number; trackedFiles: number } => {
  let trackedFiles = 0
  try {
    trackedFiles = Number.parseInt(execSilent('git ls-files | wc -l').trim(), 10) || 0
  } catch {
    // skip
  }

  let totalFiles = 0
  try {
    totalFiles =
      Number.parseInt(execSilent('find . -not -path "./.git/*" -type f | wc -l').trim(), 10) || 0
  } catch {
    // skip
  }

  return { totalFiles, trackedFiles }
}

/**
 * Get recent activity summary
 */
const getRecentActivity = (): {
  todayCommits: number
  weekCommits: number
  monthCommits: number
} => {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let todayCommits = 0
  let weekCommits = 0
  let monthCommits = 0

  try {
    todayCommits =
      Number.parseInt(execSilent(`git rev-list --count --after="${todayStr}" HEAD`).trim(), 10) || 0
  } catch {
    // skip
  }

  try {
    weekCommits =
      Number.parseInt(execSilent(`git rev-list --count --after="${weekAgo}" HEAD`).trim(), 10) || 0
  } catch {
    // skip
  }

  try {
    monthCommits =
      Number.parseInt(execSilent(`git rev-list --count --after="${monthAgo}" HEAD`).trim(), 10) || 0
  } catch {
    // skip
  }

  return { todayCommits, weekCommits, monthCommits }
}

/**
 * Interactive git stats dashboard
 */
export const handleStats = (): void => {
  log.banner()

  const spinner = log.spinner()
  spinner.start('Crunching numbers...')

  const branch = getCurrentBranch()
  const repo = getRepoInfo()
  const contributors = getTopContributors()
  const monthly = getMonthlyActivity()
  const fileTypes = getFileTypes()
  const codeStats = getCodeStats()
  const recent = getRecentActivity()

  spinner.succeed('Stats ready!')

  const line = '─'.repeat(58)

  // ─── Header ───
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}📊 Repository Stats: ${colors.green}${repo.name}${colors.reset}`
  )
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)

  // ─── Overview ───
  console.log(`${colors.cyan}│${colors.reset}  Branch    ${colors.bright}${branch}${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset}  Commits   ${colors.yellow}${fmt(repo.totalCommits)}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Branches  ${colors.bright}${repo.totalBranches}${colors.reset} local · ${colors.gray}${repo.remoteBranches} remote${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Tags      ${colors.bright}${repo.tags}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Files     ${colors.bright}${fmt(codeStats.trackedFiles)}${colors.reset} tracked · ${colors.gray}${fmt(codeStats.totalFiles)} total${colors.reset}`
  )
  if (repo.age) {
    console.log(
      `${colors.cyan}│${colors.reset}  Age       ${colors.bright}${repo.age}${colors.reset}`
    )
  }

  // ─── Recent Activity ───
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}⚡ Recent Activity${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset}  Today     ${colors.green}${recent.todayCommits}${colors.reset} commits`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Week      ${colors.green}${recent.weekCommits}${colors.reset} commits`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Month     ${colors.green}${recent.monthCommits}${colors.reset} commits`
  )

  // ─── Monthly Activity Chart ───
  if (monthly.length > 0) {
    const maxMonth = Math.max(...monthly.map((m) => m.count))
    console.log(`${colors.cyan}├${line}┤${colors.reset}`)
    console.log(
      `${colors.cyan}│${colors.reset} ${colors.bright}📈 Commit Activity (12 months)${colors.reset}`
    )
    console.log(`${colors.cyan}│${colors.reset}`)
    for (const m of monthly) {
      const label = m.month.padStart(3)
      const countStr = String(m.count).padStart(4)
      console.log(
        `${colors.cyan}│${colors.reset}  ${colors.gray}${label}${colors.reset} ${bar(m.count, maxMonth, 25)} ${colors.bright}${countStr}${colors.reset}`
      )
    }
  }

  // ─── Top Contributors ───
  if (contributors.length > 0) {
    const maxContrib = contributors[0]?.commits ?? 1
    console.log(`${colors.cyan}├${line}┤${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset} ${colors.bright}👥 Top Contributors${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset}`)
    for (const [i, c] of contributors.entries()) {
      const rank = String(i + 1).padStart(2)
      const name = c.name.length > 18 ? c.name.slice(0, 17) + '…' : c.name.padEnd(18)
      const countStr = String(c.commits).padStart(4)
      console.log(
        `${colors.cyan}│${colors.reset}  ${colors.gray}${rank}.${colors.reset} ${colors.bright}${name}${colors.reset} ${bar(c.commits, maxContrib, 15)} ${colors.yellow}${countStr}${colors.reset}`
      )
    }
  }

  // ─── File Types ───
  if (fileTypes.length > 0) {
    const maxType = fileTypes[0]?.count ?? 1
    console.log(`${colors.cyan}├${line}┤${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset} ${colors.bright}📁 File Types${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset}`)
    for (const ft of fileTypes) {
      const ext = ft.ext.padEnd(10)
      const countStr = String(ft.count).padStart(5)
      console.log(
        `${colors.cyan}│${colors.reset}  ${colors.bright}${ext}${colors.reset} ${bar(ft.count, maxType, 20)} ${colors.yellow}${countStr}${colors.reset}`
      )
    }
  }

  // ─── Footer ───
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)
}
