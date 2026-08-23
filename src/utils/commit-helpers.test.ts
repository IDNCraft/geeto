import { describe, expect, test } from 'bun:test'

import {
  extractCommitBody,
  extractCommitTitle,
  formatCommitBody,
  isConventionalLine,
  normalizeAIOutput,
} from './commit-helpers.js'

describe('commit formatting helpers', () => {
  test('normalizes fenced AI output', () => {
    expect(normalizeAIOutput('```text\nfeat: add commit tests\n```')).toBe('feat: add commit tests')
  })

  test('removes inline backticks', () => {
    expect(normalizeAIOutput('`fix: handle inline formatting`')).toBe(
      'fix: handle inline formatting'
    )
  })

  test('strips an AI prefix and surrounding quotes', () => {
    expect(
      normalizeAIOutput('Here is the suggested commit: "fix(parser): handle quoted output"')
    ).toBe('fix(parser): handle quoted output')
  })

  test('extracts a conventional title with scope', () => {
    const title = 'feat(parser): support commit formatting'

    expect(extractCommitTitle(`${title}\n\nKeep the body separate.`)).toBe(title)
  })

  test('extracts and trims non-empty body lines after the title', () => {
    const title = 'feat(parser): support commit formatting'
    const message = `${title}\n\n  First line  \n\nSecond line`

    expect(extractCommitBody(message, title)).toBe('First line\nSecond line')
  })

  test('wraps long body lines at 72 characters', () => {
    const body =
      'This line has enough words to be wrapped at the seventy-two character limit without losing any content'

    expect(formatCommitBody(body)).toBe(
      'This line has enough words to be wrapped at the seventy-two character\nlimit without losing any content'
    )
  })

  test('rejects invalid conventional lines', () => {
    expect(isConventionalLine('feature(parser): add tests')).toBe(false)
    expect(isConventionalLine('feat - add tests')).toBe(false)
  })
})
