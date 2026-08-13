import fs from 'node:fs'
import path from 'node:path'

import { colors } from './colors.js'
import { exec, execSilent } from './exec.js'
import { log } from './logging.js'
import { confirm } from '../cli/input.js'
import { VERSION } from '../version.js'

type InstallMethod = 'homebrew' | 'npm' | 'bun' | 'binary' | 'unknown'

const CACHE_FILE = path.join(process.cwd(), '.geeto', 'update-check.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/IDNCraft/geeto/main/tools/install.sh'
const GITHUB_REPO = 'IDNCraft/geeto'
const HOMEBREW_FORMULA_URL =
  'https://raw.githubusercontent.com/IDNCraft/homebrew-geeto/main/Formula/geeto.rb'

interface UpdateInfo {
  latestVersion: string
  currentVersion: string
  hasUpdate: boolean
}

interface UpdateCache {
  checkedAt: string
  latestVersion: string
}

export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] ?? 0
    const bNum = bParts[i] ?? 0
    if (aNum > bNum) return 1
    if (aNum < bNum) return -1
  }
  return 0
}

function readCache(): UpdateCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    return JSON.parse(raw) as UpdateCache
  } catch {
    return null
  }
}

function writeCache(latestVersion: string): void {
  try {
    const dir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const cache: UpdateCache = {
      checkedAt: new Date().toISOString(),
      latestVersion,
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
  } catch {
    /* ignore */
  }
}

function isCacheValid(cache: UpdateCache): boolean {
  const checkedAt = new Date(cache.checkedAt).getTime()
  return Date.now() - checkedAt < CACHE_TTL_MS
}

export function detectInstallMethod(): InstallMethod {
  let binPath = ''
  try {
    binPath = execSilent('which geeto').trim()
  } catch {
    try {
      binPath = execSilent('command -v geeto').trim()
    } catch {
      return 'unknown'
    }
  }

  if (binPath.includes('/opt/homebrew/') || binPath.includes('/usr/local/Cellar/'))
    return 'homebrew'
  if (binPath.includes('node_modules')) return 'npm'
  if (binPath.includes('.bun')) return 'bun'

  try {
    const result = execSilent('brew list geeto').trim()
    if (result) return 'homebrew'
  } catch {
    /* not brew */
  }

  try {
    const result = execSilent('npm list -g geeto').trim()
    if (result && !result.includes('empty')) return 'npm'
  } catch {
    /* not npm */
  }

  try {
    const result = execSilent('bun pm ls -g').trim()
    if (result.includes('geeto')) return 'bun'
  } catch {
    /* not bun */
  }

  if (binPath) return 'binary'
  return 'unknown'
}

export function methodLabel(method: InstallMethod): string {
  const labels: Record<InstallMethod, string> = {
    homebrew: 'Homebrew',
    npm: 'npm (global)',
    bun: 'bun (global)',
    binary: 'Standalone binary',
    unknown: 'Unknown',
  }
  return labels[method]
}

async function fetchLatestBrewVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 3000)

    try {
      const response = await fetch(HOMEBREW_FORMULA_URL, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (response.ok) {
        const formula = await response.text()
        const version = formula.match(/^\s*version\s+"([^"]+)"/m)?.[1]
        if (version) return version
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    /* fall back to local Homebrew metadata */
  }

  try {
    const json = execSilent('brew info geeto --json=v2')
    const data = JSON.parse(json) as {
      formulae?: Array<{ versions?: { stable?: string } }>
    }
    return data.formulae?.[0]?.versions?.stable ?? null
  } catch {
    return null
  }
}

async function fetchLatestNpmVersion(): Promise<string | null> {
  try {
    const version = execSilent('npm view geeto version').trim()
    return version || null
  } catch {
    return null
  }
}

async function fetchLatestBunVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 3000)

    const response = await fetch('https://registry.npmjs.org/geeto/latest', {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as { version: string }
    return data.version ?? null
  } catch {
    return null
  }
}

async function fetchLatestGithubVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 3000)

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as { tag_name?: string }
    const tag = data.tag_name ?? ''
    return tag.replace(/^v/, '') || null
  } catch {
    return null
  }
}

function updateCommand(method: InstallMethod): string {
  switch (method) {
    case 'npm': {
      return 'npm install -g geeto@latest'
    }
    case 'bun': {
      return 'bun install -g geeto@latest'
    }
    case 'homebrew': {
      return 'brew upgrade idncraft/geeto/geeto'
    }
    case 'binary':
    case 'unknown': {
      return `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`
    }
  }
}

export async function fetchLatestVersion(method?: InstallMethod): Promise<string | null> {
  const installMethod = method ?? detectInstallMethod()

  switch (installMethod) {
    case 'homebrew': {
      return fetchLatestBrewVersion()
    }
    case 'npm': {
      return fetchLatestNpmVersion()
    }
    case 'bun': {
      return fetchLatestBunVersion()
    }
    case 'binary':
    case 'unknown': {
      return fetchLatestGithubVersion()
    }
  }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const method = detectInstallMethod()
  const cached = readCache()

  if (cached && isCacheValid(cached)) {
    if (compareVersions(cached.latestVersion, VERSION) > 0) {
      return {
        latestVersion: cached.latestVersion,
        currentVersion: VERSION,
        hasUpdate: true,
      }
    }
    return null
  }

  const latestVersion = await fetchLatestVersion(method)
  if (!latestVersion) return null

  writeCache(latestVersion)

  if (compareVersions(latestVersion, VERSION) > 0) {
    return {
      latestVersion,
      currentVersion: VERSION,
      hasUpdate: true,
    }
  }

  return null
}

export async function promptUpdate(info: UpdateInfo): Promise<boolean> {
  const method = detectInstallMethod()
  log.info(
    `New version available: ${colors.green}${info.latestVersion}${colors.reset} (current: ${colors.gray}v${info.currentVersion}${colors.reset})`
  )
  log.info(`Install method: ${colors.cyan}${methodLabel(method)}${colors.reset}`)

  const wantUpdate = confirm('Update Geeto now?', true)

  if (!wantUpdate) {
    log.info(`You can update later with: geeto --update`)
    return false
  }

  return performUpdate(info.latestVersion, method)
}

export async function performUpdate(
  latestVersion: string,
  method?: InstallMethod
): Promise<boolean> {
  const installMethod = method ?? detectInstallMethod()
  const cmd = updateCommand(installMethod)

  log.info(`Install method: ${colors.cyan}${methodLabel(installMethod)}${colors.reset}`)
  console.log('')

  const spinner = log.spinner()
  spinner.start(`Updating to v${latestVersion}...`)

  try {
    if (installMethod === 'binary' || installMethod === 'unknown') {
      spinner.stop()
      log.info('Downloading latest binary via install script...')
      console.log('')
      exec(cmd, false)
    } else {
      exec(cmd, true)
    }

    spinner.succeed(`Updated to v${latestVersion}!`)
    log.info('Restart the CLI for the update to take effect.')
    return true
  } catch {
    spinner.fail('Update failed.')
    log.error(`Try manually: ${cmd}`)
    return false
  }
}

export async function getVersionHint(): Promise<string | null> {
  const method = detectInstallMethod()
  const cached = readCache()
  let latestVersion: string | null = null

  if (cached && isCacheValid(cached)) {
    latestVersion = cached.latestVersion
  } else {
    latestVersion = await fetchLatestVersion(method)
    if (latestVersion) writeCache(latestVersion)
  }

  if (!latestVersion) return null

  if (compareVersions(latestVersion, VERSION) > 0) {
    return `Update available: v${latestVersion} — run ${colors.cyan}geeto --update${colors.reset} to update`
  }

  return `${colors.green}(latest)${colors.reset}`
}
