import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CliJsonOutput } from './utils/cli-json.js'
import { describe, expect, test } from 'bun:test'

interface SubprocessResult {
  status: number
  stdout: string
  stderr: string
}

const repositoryRoot = path.resolve(import.meta.dir, '..')

const runCli = (
  args: readonly string[],
  cwd = repositoryRoot,
  input?: string
): SubprocessResult => {
  const result = spawnSync(
    process.execPath,
    ['run', path.resolve(repositoryRoot, 'src/index.ts'), ...args],
    {
      cwd,
      encoding: 'utf8',
      input,
      env: { ...process.env, CI: '1' },
    }
  )

  return {
    status: result.status ?? -1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  }
}

const parseJsonOutput = (result: SubprocessResult): CliJsonOutput => {
  expect(result.stdout.trim()).not.toBe('')
  const parsed: unknown = JSON.parse(result.stdout)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('CLI did not emit a JSON object')
  }
  return parsed as CliJsonOutput
}

const createTempDirectory = (): string => mkdtempSync(path.join(tmpdir(), 'geeto-json-'))

describe('CLI JSON subprocess contract', () => {
  test('snapshots deterministic read-only JSON output', () => {
    const result = runCli(['--help', '--json'])
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(parseJsonOutput(result)).toMatchSnapshot()
  })

  test('emits clean JSON from a read-only command without a TTY', () => {
    const result = runCli(['--status', '--json'])
    const output = parseJsonOutput(result)

    expect(result.status).toBe(0)
    expect(output.status).toBe('success')
    expect(output.exit_code).toBe(0)
    expect(`${result.stdout}${result.stderr}`).not.toContain('\u001B')
    expect(output.stderr).toBe('')
  })

  test('rejects mutation commands without explicit opt-in', () => {
    const result = runCli(['--fetch', '--json'])
    const output = parseJsonOutput(result)

    expect(result.status).toBe(2)
    expect(output.status).toBe('validation-failure')
    expect(output.exit_code).toBe(2)
    expect(output.error?.code).toBe('VALIDATION_ERROR')
    expect(output.error?.message).toContain('--allow-mutations')
  })

  test('executes a mutation command only after explicit opt-in', () => {
    const cwd = createTempDirectory()
    try {
      const init = spawnSync('git', ['init', '-q'], { cwd, encoding: 'utf8' })
      expect(init.status).toBe(0)
      const result = runCli(['--fetch', '--json', '--allow-mutations'], cwd)
      const output = parseJsonOutput(result)

      expect(result.status).toBe(0)
      expect(output.status).toBe('success')
      expect(output.stdout).toContain('No remotes configured.')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('maps a read-only runtime error to its dedicated exit code', () => {
    const cwd = createTempDirectory()
    try {
      const result = runCli(['--stats', '--json'], cwd)
      const output = parseJsonOutput(result)

      expect(result.status).toBe(1)
      expect(output.status).toBe('runtime-failure')
      expect(output.exit_code).toBe(1)
      expect(output.error?.code).toBe('RUNTIME_ERROR')
      expect(`${result.stdout}${result.stderr}`).not.toContain('\u001B')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('maps an interactive cancellation to its dedicated exit code', () => {
    const cwd = createTempDirectory()
    try {
      const init = spawnSync('git', ['init', '-q'], { cwd, encoding: 'utf8' })
      expect(init.status).toBe(0)
      const remote = spawnSync(
        'git',
        ['remote', 'add', 'origin', 'https://example.invalid/geeto.git'],
        {
          cwd,
          encoding: 'utf8',
        }
      )
      expect(remote.status).toBe(0)

      const result = runCli(['--fetch', '--json', '--allow-mutations'], cwd, 'q')
      const output = parseJsonOutput(result)

      expect(result.status).toBe(3)
      expect(output.status).toBe('cancel')
      expect(output.exit_code).toBe(3)
      expect(output.error).toBeNull()
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  test('keeps human mode as plain CLI output', () => {
    const result = runCli(['--version'])

    expect(result.status).toBe(0)
    expect(result.stdout.startsWith('Geeto v')).toBe(true)
    expect(() => {
      JSON.parse(result.stdout)
    }).toThrow()
  })

  test('keeps the schema artifact valid JSON', () => {
    const schemaPath = path.resolve(repositoryRoot, 'docs/cli-json-schema.json')
    expect(() => {
      JSON.parse(readFileSync(schemaPath, 'utf8'))
    }).not.toThrow()
  })
})
