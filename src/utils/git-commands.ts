/**
 * Git command execution utilities
 */

import { exec } from './exec.js'

/** Execute git command with error handling */
export function gitExec(command: string, silent = false): string {
  const fullCommand = command.startsWith('git ') ? command : `git ${command}`
  return exec(fullCommand, silent)
}

/** Get git config value */
export function getGitConfig(key: string): string {
  try {
    return gitExec(`config ${key}`, true).trim()
  } catch {
    return ''
  }
}

/** Get git user info */
export function getGitUser(): { name: string; email: string } {
  return {
    name: getGitConfig('user.name'),
    email: getGitConfig('user.email'),
  }
}

/** Get remote URL */
export function getRemoteUrl(remote = 'origin'): string {
  try {
    return gitExec(`remote get-url ${remote}`, true).trim()
  } catch {
    return ''
  }
}

/** Get upstream branch */
export function getUpstreamBranch(): string {
  try {
    return gitExec('rev-parse --abbrev-ref --symbolic-full-name @{u}', true).trim()
  } catch {
    return ''
  }
}
