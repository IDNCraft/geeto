import { createRequire } from 'node:module'
import { GoogleGenAI } from '@google/genai'
import { expect, test } from 'bun:test'

test('Gemini runtime loads with patched protobuf dependency', () => {
  const requireFromGenai = createRequire(import.meta.resolve('@google/genai/package.json'))
  const protobuf = requireFromGenai('protobufjs')
  const protobufPackage = requireFromGenai('protobufjs/package.json')

  expect(typeof GoogleGenAI).toBe('function')
  expect(typeof protobuf.load).toBe('function')
  expect(Bun.semver.satisfies(protobufPackage.version, '>=7.6.5 <8')).toBe(true)
})
