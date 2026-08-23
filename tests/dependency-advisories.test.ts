import { expect, test } from 'bun:test'

const runtimeProviderModules = [
  '../src/api/codex-sdk.ts',
  '../src/api/gemini-sdk.ts',
  '../src/api/groq-sdk.ts',
  '../src/api/openrouter-sdk.ts',
]

test('runtime provider SDK modules remain importable', async () => {
  const modules = await Promise.all(runtimeProviderModules.map((modulePath) => import(modulePath)))

  expect(modules).toHaveLength(runtimeProviderModules.length)
})

test('dependency audit has no advisories', async () => {
  const process = Bun.spawn(['bun', 'audit', '--json'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const output = await new Response(process.stdout).text()
  const exitCode = await process.exited
  const report: unknown = output.trim() ? (JSON.parse(output) as unknown) : {}

  expect(exitCode).toBe(0)
  expect(report).toEqual({})
})
