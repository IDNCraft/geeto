/**
 * Release utilities — types, semver helpers, git helpers
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { execSilent } from '../utils/exec.js'

// ─── Types ───

export interface SemVer {
  major: number
  minor: number
  patch: number
  prerelease?: string // e.g. "beta.1", "alpha.2", "rc.1"
}

export interface CommitEntry {
  hash: string
  short: string
  subject: string
  author: string
  date: string
}

export interface CategorizedCommits {
  features: CommitEntry[]
  fixes: CommitEntry[]
  breaking: CommitEntry[]
  other: CommitEntry[]
}

// ─── Helpers ───

const isAsciiDigit = (character: string): boolean => character >= '0' && character <= '9'

const isAsciiLetter = (character: string): boolean =>
  (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z')

const hasOnlyDigits = (value: string): boolean =>
  value.length > 0 && [...value].every((character) => isAsciiDigit(character))

const isNumericIdentifier = (value: string): boolean =>
  hasOnlyDigits(value) && (value === '0' || value[0] !== '0')

const isValidPrereleaseIdentifier = (value: string): boolean => {
  const hasValidCharacters =
    value.length > 0 &&
    [...value].every(
      (character) => isAsciiDigit(character) || isAsciiLetter(character) || character === '-'
    )

  return hasValidCharacters && (!hasOnlyDigits(value) || isNumericIdentifier(value))
}

export const parseSemver = (version: string): SemVer | null => {
  const prereleaseSeparator = version.indexOf('-')
  const core = prereleaseSeparator === -1 ? version : version.slice(0, prereleaseSeparator)
  const prerelease = prereleaseSeparator === -1 ? undefined : version.slice(prereleaseSeparator + 1)
  const coreParts = core.split('.')
  const hasInvalidPrerelease =
    prerelease?.split('.').some((identifier) => !isValidPrereleaseIdentifier(identifier)) ?? false

  if (
    coreParts.length !== 3 ||
    coreParts.some((part) => !isNumericIdentifier(part)) ||
    hasInvalidPrerelease
  ) {
    return null
  }

  return {
    major: Number.parseInt(coreParts[0] ?? '0', 10),
    minor: Number.parseInt(coreParts[1] ?? '0', 10),
    patch: Number.parseInt(coreParts[2] ?? '0', 10),
    prerelease,
  }
}

export const formatSemver = (sv: SemVer): string =>
  sv.prerelease
    ? `${sv.major}.${sv.minor}.${sv.patch}-${sv.prerelease}`
    : `${sv.major}.${sv.minor}.${sv.patch}`

export const isPrerelease = (version: string): boolean => {
  const sv = parseSemver(version)
  return sv?.prerelease != null
}

/** Parse prerelease tag into [label, number]. e.g. "beta.3" → ["beta", 3] */
const parsePreTag = (pre: string): [string, number] => {
  const dot = pre.lastIndexOf('.')
  if (dot === -1) return [pre, 0]
  const label = pre.slice(0, dot)
  const num = Number.parseInt(pre.slice(dot + 1), 10)
  return [label, Number.isNaN(num) ? 0 : num]
}

/** Bump prerelease number: beta.1 → beta.2. If no prerelease, start at label.1 */
export const bumpPrerelease = (sv: SemVer, label?: string): SemVer => {
  if (sv.prerelease) {
    const [curLabel, curNum] = parsePreTag(sv.prerelease)
    if (!label || label === curLabel) {
      return { ...sv, prerelease: `${curLabel}.${curNum + 1}` }
    }
    // Different label — start at 1 (e.g. beta.3 → rc.1)
    return { ...sv, prerelease: `${label}.1` }
  }
  // Stable → prerelease: use next patch as base
  return {
    ...sv,
    patch: sv.patch + 1,
    prerelease: `${label ?? 'beta'}.1`,
  }
}

/** Promote prerelease to stable: 1.0.0-beta.3 → 1.0.0 */
export const promoteToStable = (sv: SemVer): SemVer => ({
  major: sv.major,
  minor: sv.minor,
  patch: sv.patch,
})

export const getCurrentVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const getExistingTags = (): string[] => {
  try {
    // Sort by creation date (newest first), NOT version number.
    // Version sort breaks when older dummy/test tags have higher semver (e.g. v2.0.0 before v0.3.x).
    const output = execSilent('git tag --list --sort=-creatordate').trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

export const getCommitsSinceTag = (tag?: string): CommitEntry[] => {
  try {
    const sep = '<<GTO>>'
    const range = tag ? `${tag}..HEAD` : 'HEAD'
    const output = execSilent(
      `git log ${range} --format="%H${sep}%h${sep}%s${sep}%an${sep}%ci" --no-merges`
    ).trim()
    if (!output) return []
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(sep)
        return {
          hash: parts[0] ?? '',
          short: parts[1] ?? '',
          subject: parts[2] ?? '',
          author: parts[3] ?? '',
          date: parts[4] ?? '',
        }
      })
  } catch {
    return []
  }
}

export const categorizeCommits = (commits: CommitEntry[]): CategorizedCommits => {
  const result: CategorizedCommits = {
    features: [],
    fixes: [],
    breaking: [],
    other: [],
  }

  for (const c of commits) {
    if (c.subject.includes('BREAKING CHANGE') || c.subject.includes('!:')) {
      result.breaking = [...result.breaking, c]
    } else if (c.subject.startsWith('feat')) {
      result.features = [...result.features, c]
    } else if (c.subject.startsWith('fix')) {
      result.fixes = [...result.fixes, c]
    } else {
      result.other = [...result.other, c]
    }
  }

  return result
}

export const getRepoUrl = (): string => {
  try {
    return execSilent('git config --get remote.origin.url')
      .trim()
      .replace(/\.git$/, '')
      .replace(/^git@github\.com:/, 'https://github.com/')
  } catch {
    return ''
  }
}

export const updatePackageVersion = (newVersion: string): void => {
  const content = readFileSync('package.json', 'utf8')
  const pkg = JSON.parse(content) as Record<string, unknown>
  pkg.version = newVersion
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8')

  // Also update the compiled-binary-safe version constant
  try {
    const versionTs = readFileSync('src/version.ts', 'utf8')
    writeFileSync(
      'src/version.ts',
      versionTs.replace(/VERSION = '[^']*'/, `VERSION = '${newVersion}'`),
      'utf8'
    )
  } catch {
    /* version.ts update is best-effort */
  }
}
