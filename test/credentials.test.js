/* eslint-disable security/detect-non-literal-fs-filename -- Test paths come from mkdtemp. */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { writeCredentialFile } from '../src/utils/credentials.js'

const GEMINI_KEY = 'AI-test-key-canary-000000000000000'
const TRELLO_API_KEY = 'trello-api-key-canary'
const TRELLO_TOKEN = 'trello-token-canary'
const openedUrls = []

const temporaryHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'geeto-home-'))
const temporaryHome = path.join(temporaryHomeRoot, 'home')
fs.mkdirSync(temporaryHome)

mock.module(path.join(import.meta.dir, '../src/cli/input.ts'), () => ({
  askQuestion: (question) => {
    if (question.includes('Gemini API Key')) return GEMINI_KEY
    if (question.includes('Trello API Key')) return TRELLO_API_KEY
    if (question.includes('Trello Token')) return TRELLO_TOKEN
    if (question.includes('Trello Board ID')) return 'board-id-canary'
    return ''
  },
  confirm: () => true,
}))

mock.module(path.join(import.meta.dir, '../src/utils/exec.ts'), () => ({
  openBrowser: (url) => {
    openedUrls.push(url)
    return true
  },
}))

const { setupTrelloConfigInteractive } = await import('../src/core/trello-setup.js')

const mode = (filePath) => fs.statSync(filePath).mode & 0o777

const withPermissiveUmask = (run) => {
  const originalUmask = process.umask(0o000)
  try {
    return run()
  } finally {
    process.umask(originalUmask)
  }
}

describe('credential permissions', () => {
  beforeEach(() => {
    openedUrls.length = 0
  })

  afterAll(() => {
    fs.rmSync(temporaryHomeRoot, { recursive: true, force: true })
  })

  test('creates private global credentials without changing model file policy', () => {
    const messages = []
    const consoleSpy = spyOn(console, 'log').mockImplementation((...arguments_) => {
      messages.push(arguments_.map(String).join(' '))
    })

    try {
      withPermissiveUmask(() => {
        const configDirectory = path.join(temporaryHome, '.geeto')
        writeCredentialFile(
          path.join(configDirectory, 'gemini.toml'),
          `gemini_api_key = "${GEMINI_KEY}"\n`
        )
        fs.writeFileSync(path.join(configDirectory, 'gemini-model.json'), '{}', 'utf8')
      })
    } finally {
      consoleSpy.mockRestore()
    }

    const configDirectory = path.join(temporaryHome, '.geeto')
    const credentialFile = path.join(configDirectory, 'gemini.toml')
    const modelFile = path.join(configDirectory, 'gemini-model.json')

    expect(fs.readFileSync(credentialFile, 'utf8').includes(GEMINI_KEY)).toBeTrue()
    expect(messages.some((message) => message.includes(GEMINI_KEY))).toBeFalse()

    if (process.platform !== 'win32') {
      expect(mode(configDirectory)).toBe(0o700)
      expect(mode(credentialFile)).toBe(0o600)
      expect(mode(modelFile)).toBe(0o666)
    }
  })

  test('repairs permissions on overwrite and redacts credential logging', () => {
    const originalCwd = process.cwd()
    const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'geeto-project-'))
    const configDirectory = path.join(projectDirectory, '.geeto')
    const credentialFile = path.join(configDirectory, 'trello.toml')
    const messages = []
    const consoleSpy = spyOn(console, 'log').mockImplementation((...arguments_) => {
      messages.push(arguments_.map(String).join(' '))
    })

    try {
      process.chdir(projectDirectory)
      withPermissiveUmask(() => {
        fs.mkdirSync(configDirectory, { mode: 0o777 })
        fs.writeFileSync(credentialFile, 'token = "old-token-canary"\n', { mode: 0o666 })
        expect(setupTrelloConfigInteractive()).toBeTrue()
      })

      expect(fs.readFileSync(credentialFile, 'utf8').includes(TRELLO_TOKEN)).toBeTrue()
      expect(messages.some((message) => message.includes(TRELLO_API_KEY))).toBeFalse()
      expect(messages.some((message) => message.includes(TRELLO_TOKEN))).toBeFalse()
      expect(messages.some((message) => message.includes('[REDACTED]'))).toBeTrue()
      expect(openedUrls.some((url) => url.includes(TRELLO_API_KEY))).toBeTrue()

      if (process.platform !== 'win32') {
        expect(mode(configDirectory)).toBe(0o700)
        expect(mode(credentialFile)).toBe(0o600)
      }
    } finally {
      consoleSpy.mockRestore()
      process.chdir(originalCwd)
      fs.rmSync(projectDirectory, { recursive: true, force: true })
    }
  })
})
