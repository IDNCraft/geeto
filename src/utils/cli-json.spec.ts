import { describe, expect, test } from 'bun:test'

import {
  classifyJsonExit,
  classifyOutputCancellation,
  CLI_EXIT_CODES,
  CLI_JSON_SCHEMA_VERSION,
  createCliJsonOutput,
  JsonExitSignal,
  stripAnsi,
} from './cli-json.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isValidCliJsonOutput = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (value['schema_version'] !== CLI_JSON_SCHEMA_VERSION) return false
  if (typeof value['command'] !== 'string' || value['command'].length === 0) return false
  if (typeof value['stdout'] !== 'string' || typeof value['stderr'] !== 'string') return false

  const status = value['status']
  const expectedExitCode =
    status === 'success'
      ? CLI_EXIT_CODES.success
      : status === 'cancel'
        ? CLI_EXIT_CODES.cancel
        : status === 'validation-failure'
          ? CLI_EXIT_CODES['validation-failure']
          : status === 'runtime-failure'
            ? CLI_EXIT_CODES['runtime-failure']
            : undefined
  if (expectedExitCode === undefined || value['exit_code'] !== expectedExitCode) return false

  const error = value['error']
  if (status === 'success' || status === 'cancel') return error === null
  if (!isRecord(error)) return false
  if (typeof error['message'] !== 'string' || error['message'].length === 0) return false
  return error['code'] === (status === 'validation-failure' ? 'VALIDATION_ERROR' : 'RUNTIME_ERROR')
}

describe('CLI JSON contract', () => {
  test('creates a versioned, ANSI-free success envelope', () => {
    const output = createCliJsonOutput({
      command: '--status',
      status: 'success',
      capture: {
        stdout: '\u001B[36mStatus\u001B[0m\r\n',
        stderr: '',
      },
    })

    expect(output).toEqual({
      schema_version: 1,
      command: '--status',
      status: 'success',
      exit_code: 0,
      stdout: 'Status\n',
      stderr: '',
      error: null,
    })
    expect(isValidCliJsonOutput(output)).toBe(true)
  })

  test('maps every documented outcome to a distinct exit code', () => {
    expect(CLI_EXIT_CODES).toEqual({
      'success': 0,
      'runtime-failure': 1,
      'validation-failure': 2,
      'cancel': 3,
    })

    expect(
      createCliJsonOutput({
        command: '--status',
        status: 'validation-failure',
        capture: { stdout: '', stderr: '' },
        error: { code: 'VALIDATION_ERROR', message: 'invalid' },
      }).exit_code
    ).toBe(2)
    expect(
      createCliJsonOutput({
        command: '--status',
        status: 'runtime-failure',
        capture: { stdout: '', stderr: '' },
        error: { code: 'RUNTIME_ERROR', message: 'failed' },
      }).exit_code
    ).toBe(1)
    expect(
      createCliJsonOutput({
        command: '--status',
        status: 'cancel',
        capture: { stdout: '', stderr: '' },
      }).exit_code
    ).toBe(3)
  })

  test('classifies intercepted exits and cancellation text', () => {
    expect(classifyJsonExit(new JsonExitSignal(0))).toBe('success')
    expect(classifyJsonExit(new JsonExitSignal(1))).toBe('runtime-failure')
    expect(classifyOutputCancellation({ stdout: 'Cancelled by user\n', stderr: '' })).toBe(true)
    expect(classifyOutputCancellation({ stdout: 'Status is clean\n', stderr: '' })).toBe(false)
  })

  test('documents the same required schema fields as the emitted envelope', async () => {
    const schema: unknown = JSON.parse(
      await Bun.file(new URL('../../docs/cli-json-schema.json', import.meta.url)).text()
    )
    expect(isRecord(schema)).toBe(true)
    if (!isRecord(schema)) return

    const properties = schema['properties']
    expect(isRecord(properties)).toBe(true)
    if (!isRecord(properties)) return

    for (const field of [
      'schema_version',
      'command',
      'status',
      'exit_code',
      'stdout',
      'stderr',
      'error',
    ]) {
      expect(field in properties).toBe(true)
    }

    expect(schema['required']).toEqual([
      'schema_version',
      'command',
      'status',
      'exit_code',
      'stdout',
      'stderr',
      'error',
    ])
  })

  test('accepts every emitted outcome under the schema contract', () => {
    const outputs = [
      createCliJsonOutput({
        command: '--status',
        status: 'success',
        capture: { stdout: '', stderr: '' },
      }),
      createCliJsonOutput({
        command: '--status',
        status: 'cancel',
        capture: { stdout: '', stderr: '' },
      }),
      createCliJsonOutput({
        command: '--status',
        status: 'validation-failure',
        capture: { stdout: '', stderr: '' },
        error: { code: 'VALIDATION_ERROR', message: 'invalid' },
      }),
      createCliJsonOutput({
        command: '--status',
        status: 'runtime-failure',
        capture: { stdout: '', stderr: '' },
        error: { code: 'RUNTIME_ERROR', message: 'failed' },
      }),
    ]

    for (const output of outputs) expect(isValidCliJsonOutput(output)).toBe(true)
    expect(stripAnsi('\u001B[31mred\u001B[0m\r')).toBe('red')
  })
})
