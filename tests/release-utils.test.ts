import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

import { parseSemver } from '../src/workflows/release-utils.js'

const validVersions = [
  { input: '0.0.0', expected: { major: 0, minor: 0, patch: 0 } },
  { input: '1.2.3', expected: { major: 1, minor: 2, patch: 3 } },
  {
    input: '1.2.3-alpha',
    expected: { major: 1, minor: 2, patch: 3, prerelease: 'alpha' },
  },
  {
    input: '10.20.30-beta.1',
    expected: { major: 10, minor: 20, patch: 30, prerelease: 'beta.1' },
  },
  {
    input: '1.2.3-rc.1-x',
    expected: { major: 1, minor: 2, patch: 3, prerelease: 'rc.1-x' },
  },
]

const invalidVersions = [
  '1.2',
  '1.2.3x',
  '1.2.3-',
  '1.2.3-.',
  '1.2.3-beta.',
  '1.2.3-beta..1',
  '1.2.3-beta.01',
  '1.2.3-01',
  '01.2.3',
  '1.2.03',
]

describe('parseSemver', () => {
  for (const { input, expected } of validVersions) {
    test(`accepts ${input}`, () => {
      expect(parseSemver(input)).toEqual(expected)
    })
  }

  for (const input of invalidVersions) {
    test(`rejects ${input}`, () => {
      expect(parseSemver(input)).toBeNull()
    })
  }

  test('rejects malformed version from the release workflow fixture', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/release-workflow/package.json', import.meta.url), 'utf8')
    ) as { version: string }

    expect(parseSemver(fixture.version)).toBeNull()
  })
})
