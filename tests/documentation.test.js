import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'bun:test'

const repositoryRoot = path.resolve(import.meta.dir, '..')

const readDocumentation = (relativePath) =>
  readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

const extractProviderNames = (markdown, heading) => {
  const headingStart = markdown.indexOf(heading)
  const nextHeading = markdown.indexOf('\n## ', headingStart + heading.length)
  const section = markdown.slice(headingStart, nextHeading === -1 ? markdown.length : nextHeading)

  return section
    .split('\n')
    .filter((line) => line.startsWith('| **'))
    .map((line) => line.split('|')[1].replaceAll('**', '').trim())
}

const extractSetupCommands = (markdown) =>
  Array.from(
    markdown.matchAll(/`(geeto --setup-(?:gemini|openrouter|groq|codex|opencode))`/g),
    ([, command]) => command
  )

const extractDocumentedScripts = (markdown) =>
  Array.from(markdown.matchAll(/bun run ([a-z0-9:_-]+)/g), ([, script]) => script)

test('contributor project map points to existing source files', () => {
  const contributing = readDocumentation('CONTRIBUTING.md')
  const mapStart = contributing.indexOf('## Project Structure')
  const mapEnd = contributing.indexOf('\n## Adding a New AI Provider', mapStart)
  const map = contributing.slice(mapStart, mapEnd)

  for (const row of map.split('\n').filter((line) => line.startsWith('| `'))) {
    const cells = row.split('|').map((cell) => cell.trim())
    const directory = cells[1].replaceAll('`', '').replace(/\/$/, '')
    const files = cells[2].match(/`[^`]+`/g) ?? []

    for (const file of files) {
      expect(existsSync(path.join(repositoryRoot, 'src', directory, file.slice(1, -1)))).toBe(true)
    }
  }
})

test('README and CONTRIBUTING keep providers and setup commands aligned', () => {
  const readme = readDocumentation('README.md')
  const contributing = readDocumentation('CONTRIBUTING.md')

  expect(extractProviderNames(readme, '## AI Providers')).toEqual(
    extractProviderNames(contributing, '## Supported AI Providers')
  )
  expect([...new Set(extractSetupCommands(readme))].sort()).toEqual(
    [...new Set(extractSetupCommands(contributing))].sort()
  )
})

test('documented scripts and repository links resolve', () => {
  const documentedFiles = ['README.md', 'CONTRIBUTING.md', '.github/PULL_REQUEST_TEMPLATE.md']
  const qualityCommands = [
    'bun test',
    'bun run format:check',
    'bun run lint',
    'bun run lint:md',
    'bun run lint:yaml',
    'bun run typecheck',
    'bun run build',
    'bun run check:fast',
    'bun run check:full',
  ]
  const packageManifest = JSON.parse(readDocumentation('package.json'))

  for (const relativePath of documentedFiles) {
    const markdown = readDocumentation(relativePath)

    if (relativePath !== '.github/PULL_REQUEST_TEMPLATE.md') {
      for (const command of qualityCommands) {
        expect(markdown.includes(command)).toBe(true)
      }
    }

    for (const script of extractDocumentedScripts(markdown)) {
      expect(packageManifest.scripts[script]).toBeDefined()
    }

    for (const [, target] of markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (target.includes('://') || target.startsWith('mailto:') || target.startsWith('#')) continue

      const targetPath = target.split('#')[0]
      expect(existsSync(path.resolve(repositoryRoot, path.dirname(relativePath), targetPath))).toBe(
        true
      )
    }
  }
})
