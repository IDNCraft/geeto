import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'

import { execFile, execFileAsync } from '../src/utils/exec.js'

const tempDirectories = []

const createSpawnSpy = () => {
  const directory = mkdtempSync(join(tmpdir(), 'geeto-exec-test-'))
  tempDirectories.push(directory)

  const markerPath = join(directory, 'shell-command-ran')
  const recordPath = join(directory, 'argv.json')
  const spyPath = join(directory, 'spawn-spy.js')
  writeFileSync(
    spyPath,
    [
      "import { writeFileSync } from 'node:fs'",
      'const [recordPath, ...argv] = process.argv.slice(2)',
      'writeFileSync(recordPath, JSON.stringify({ executable: process.execPath, argv }))',
      "process.stdout.write('  spy output  \\n')",
    ].join('\n'),
    'utf8'
  )

  return { markerPath, recordPath, spyPath }
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('argv command execution', () => {
  const metacharacters = (markerPath) => [
    `$(touch ${markerPath})`,
    `\`touch ${markerPath}\``,
    `quotes 'single' "double"`,
    `value; touch ${markerPath}`,
    'line one\nline two',
    'Unicode 日本語 🚀',
    '--force',
  ]

  test('passes shell metacharacters unchanged to a synchronous executable', () => {
    const { markerPath, recordPath, spyPath } = createSpawnSpy()
    const argv = metacharacters(markerPath)

    const output = execFile(process.execPath, [spyPath, recordPath, ...argv], true)
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))

    expect(record).toEqual({ executable: process.execPath, argv })
    expect(output).toBe('  spy output')
    expect(existsSync(markerPath)).toBe(false)
  })

  test('passes shell metacharacters unchanged to an asynchronous executable', async () => {
    const { markerPath, recordPath, spyPath } = createSpawnSpy()
    const argv = metacharacters(markerPath)

    const result = await execFileAsync(process.execPath, [spyPath, recordPath, ...argv], true)
    const record = JSON.parse(readFileSync(recordPath, 'utf8'))

    expect(record).toEqual({ executable: process.execPath, argv })
    expect(result).toEqual({ code: 0, stdout: 'spy output', stderr: '' })
    expect(existsSync(markerPath)).toBe(false)
  })

  test('keeps async exit code and captured output on errors', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'geeto-exec-test-'))
    tempDirectories.push(directory)
    const spyPath = join(directory, 'failing-spy.js')
    writeFileSync(
      spyPath,
      "process.stdout.write('out\\n'); process.stderr.write('err\\n'); process.exit(7)",
      'utf8'
    )

    try {
      await execFileAsync(process.execPath, [spyPath], true)
      throw new Error('Expected command to fail')
    } catch (error) {
      const commandError = error
      expect(commandError.message).toContain('Command failed:')
      expect(commandError.code).toBe(7)
      expect(commandError.stdout).toBe('out\n')
      expect(commandError.stderr).toBe('err\n')
    }
  })
})
