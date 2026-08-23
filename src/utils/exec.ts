/** Execute shell commands and helpers. */

import { execFileSync, execSync, spawn } from 'node:child_process'

import { isDryRun, isMutatingCommand, logDryRun } from './dry-run.js'
import { log } from './logging.js'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

const formatCommand = (executable: string, args: readonly string[]): string =>
  [executable, ...args]
    .map((part) => (/^[\w./:@%+=,-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(' ')

/** Run a command and return its stdout with trailing whitespace removed. */
export const exec = (command: string, silent = false): string => {
  if (isDryRun() && isMutatingCommand(command)) {
    logDryRun(command)
    return ''
  }

  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    })
    return result?.trimEnd() || ''
  } catch (error) {
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

/** Run an executable synchronously with dynamic values isolated as argv. */
export const execFile = (executable: string, args: readonly string[], silent = false): string => {
  const command = formatCommand(executable, args)
  if (isDryRun() && isMutatingCommand(command)) {
    logDryRun(command)
    return ''
  }

  try {
    const result = execFileSync(executable, args, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    })
    return result?.trimEnd() || ''
  } catch (error) {
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

/** Run an executable asynchronously with dynamic values isolated as argv. */
export const execFileAsync = (
  executable: string,
  args: readonly string[],
  silent = false
): Promise<ExecResult> => {
  const command = formatCommand(executable, args)
  if (isDryRun() && isMutatingCommand(command)) {
    logDryRun(command)
    return Promise.resolve({ code: 0, stdout: '', stderr: '' })
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false })
    let out = ''
    let err = ''

    child.stdout?.on('data', (data: Buffer) => {
      const value = data.toString()
      out += value
      if (!silent) process.stdout.write(value)
    })
    child.stderr?.on('data', (data: Buffer) => {
      const value = data.toString()
      err += value
      if (!silent) process.stderr.write(value)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code: code ?? 0, stdout: out.trim(), stderr: err.trim() })
        return
      }

      const commandError = new Error(`Command failed: ${command} (code ${code})`) as Error & {
        code?: number
        stdout?: string
        stderr?: string
      }
      commandError.code = code ?? 0
      commandError.stdout = out
      commandError.stderr = err
      reject(commandError)
    })
  })
}

/** Run git commands and handle common non-zero exit codes gracefully. */
export const execGit = (command: string, silent = false): string => {
  if (isDryRun() && isMutatingCommand(command)) {
    logDryRun(command)
    return ''
  }

  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024,
    })
    return result?.trim() || ''
  } catch (error) {
    // For git commands, exit code 1 is often not an error (e.g., git diff when there are changes)
    const execError = error as { status?: number }
    if (execError.status === 1 && command.includes('git diff')) {
      // Return empty string for git diff when there are no changes to diff
      return ''
    }
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

// /** Run a command silently and return stdout. */
export const execSilent = (command: string): string => {
  return exec(command, true)
}

/** Run an executable silently with dynamic values isolated as argv. */
export const execFileSilent = (executable: string, args: readonly string[]): string => {
  return execFile(executable, args, true)
}

/** Check whether an executable is available on PATH. */
export const commandExists = (command: string): boolean => {
  const platform = process.platform
  const checkCommand = platform === 'win32' ? 'where' : 'which'
  try {
    execFile(checkCommand, [command], true)
    return true
  } catch {
    return false
  }
}

/**
 * Open a URL in the user's default browser.
 * Returns true if the browser was opened successfully, false otherwise.
 * On Linux, checks for xdg-open availability first.
 */
export const openBrowser = (url: string): boolean => {
  const platform = process.platform
  try {
    if (platform === 'darwin') {
      execFile('open', [url], true)
      return true
    }
    if (platform === 'win32') {
      execFile('rundll32', ['url.dll,FileProtocolHandler', url], true)
      return true
    }
    // Linux / other
    if (commandExists('xdg-open')) {
      execFile('xdg-open', [url], true)
      return true
    }
    return false
  } catch {
    return false
  }
}
