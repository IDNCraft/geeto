import { format } from 'node:util'

export const CLI_JSON_SCHEMA_VERSION = 1 as const

export const CLI_EXIT_CODES = {
  'success': 0,
  'runtime-failure': 1,
  'validation-failure': 2,
  'cancel': 3,
} as const

export type CliJsonStatus = keyof typeof CLI_EXIT_CODES
export type CliExitCode = (typeof CLI_EXIT_CODES)[CliJsonStatus]

export interface CliJsonError {
  code: 'VALIDATION_ERROR' | 'RUNTIME_ERROR'
  message: string
}

export interface CliJsonOutput {
  schema_version: typeof CLI_JSON_SCHEMA_VERSION
  command: string
  status: CliJsonStatus
  exit_code: CliExitCode
  stdout: string
  stderr: string
  error: CliJsonError | null
}

export interface JsonOutputCapture {
  stdout: string
  stderr: string
}

export interface JsonOutputCaptureSession {
  capture: JsonOutputCapture
  restore: () => void
}

let jsonOutputEnabled = false

export const isJsonOutputEnabled = (): boolean => jsonOutputEnabled

export class JsonExitSignal extends Error {
  readonly exitCode: number
  readonly exitStack: string

  constructor(exitCode: number) {
    super(`CLI exited with code ${exitCode}`)
    this.name = 'JsonExitSignal'
    this.exitCode = exitCode
    this.exitStack = new Error('capture exit stack').stack ?? ''
  }
}

const ANSI_ESCAPE_PATTERN =
  /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~])/g

const CANCELLATION_PATTERN =
  /\b(?:cancel(?:led|ed)?|abort(?:ing|ed)|no staged files|no changes found|no files selected)\b/i

export const stripAnsi = (value: string): string =>
  value.replaceAll(ANSI_ESCAPE_PATTERN, '').replaceAll('\r', '')

const appendChunk = (
  capture: JsonOutputCapture,
  stream: keyof JsonOutputCapture,
  chunk: string | Uint8Array
): void => {
  capture[stream] += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString()
}

const formatCapturedArgs = (args: readonly unknown[]): string =>
  format(...args.map((arg) => (arg instanceof Error ? arg.message : arg)))

type WriteCallback = (error?: Error | null) => void
type WriteEncodingOrCallback = BufferEncoding | WriteCallback

const captureWrite = (
  capture: JsonOutputCapture,
  stream: keyof JsonOutputCapture,
  chunk: string | Uint8Array,
  encodingOrCallback?: WriteEncodingOrCallback,
  callback?: WriteCallback
): boolean => {
  appendChunk(capture, stream, chunk)
  const callbackFn = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
  callbackFn?.()
  return true
}

export const startJsonOutputCapture = (): JsonOutputCaptureSession => {
  const capture: JsonOutputCapture = { stdout: '', stderr: '' }
  jsonOutputEnabled = true
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn
  const originalStdoutWrite = process.stdout.write
  const originalStderrWrite = process.stderr.write

  console.log = (...args: unknown[]): void => {
    capture.stdout += `${formatCapturedArgs(args)}\n`
  }
  console.error = (...args: unknown[]): void => {
    capture.stderr += `${formatCapturedArgs(args)}\n`
  }
  console.warn = (...args: unknown[]): void => {
    capture.stderr += `${formatCapturedArgs(args)}\n`
  }
  process.stdout.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: WriteEncodingOrCallback,
    callback?: WriteCallback
  ) =>
    captureWrite(
      capture,
      'stdout',
      chunk,
      encodingOrCallback,
      callback
    )) as typeof process.stdout.write
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: WriteEncodingOrCallback,
    callback?: WriteCallback
  ) =>
    captureWrite(
      capture,
      'stderr',
      chunk,
      encodingOrCallback,
      callback
    )) as typeof process.stderr.write

  return {
    capture,
    restore: () => {
      jsonOutputEnabled = false
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
      process.stdout.write = originalStdoutWrite
      process.stderr.write = originalStderrWrite
    },
  }
}

export const classifyJsonExit = (signal: JsonExitSignal): CliJsonStatus => {
  if (signal.exitCode !== CLI_EXIT_CODES.success) return 'runtime-failure'

  const cancellationStack = /(?:src[\\/]cli[\\/](?:input|menu)\.ts)/i.test(signal.exitStack)
  return cancellationStack ? 'cancel' : 'success'
}

export const classifyOutputCancellation = (capture: JsonOutputCapture): boolean =>
  CANCELLATION_PATTERN.test(`${capture.stdout}\n${capture.stderr}`)

export const createCliJsonOutput = (input: {
  command: string
  status: CliJsonStatus
  capture: JsonOutputCapture
  error?: CliJsonError | null
}): CliJsonOutput => ({
  schema_version: CLI_JSON_SCHEMA_VERSION,
  command: input.command,
  status: input.status,
  exit_code: CLI_EXIT_CODES[input.status],
  stdout: stripAnsi(input.capture.stdout),
  stderr: stripAnsi(input.capture.stderr),
  error: input.error
    ? {
        code: input.error.code,
        message: stripAnsi(input.error.message),
      }
    : null,
})
