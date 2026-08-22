import { describe, expect, test } from 'bun:test'

const workflows = new URL('../.github/workflows/', import.meta.url)

const expectedTargets = [
  { os: 'ubuntu-latest', binary: 'geeto-linux' },
  { os: 'ubuntu-24.04-arm', binary: 'geeto-linux-arm64' },
  { os: 'windows-latest', binary: 'geeto-windows.exe' },
  { os: 'macos-15-intel', binary: 'geeto-mac' },
  { os: 'macos-latest', binary: 'geeto-mac-arm64' },
]

async function readWorkflow(name) {
  return Bun.file(new URL(name, workflows)).text()
}

function artifactName(workflow, action) {
  return workflow.match(
    new RegExp(`uses: actions/${action}-artifact@v4\\n\\s+with:\\n\\s+name: ([^\\n]+)`)
  )?.[1]
}

function uploadedFiles(workflow) {
  const block = workflow.match(/^\s+path: \|\n(?<paths>[\s\S]*?)^\s+retention-days:/m)?.groups
    ?.paths

  return (
    block
      ?.trim()
      .split('\n')
      .map((line) => line.trim()) ?? []
  )
}

function smokeTargets(workflow) {
  return [...workflow.matchAll(/^\s+- os: (\S+)\n\s+binary: (\S+)$/gm)].map((match) => ({
    os: match[1] ?? '',
    binary: match[2] ?? '',
  }))
}

describe('cross-platform artifact contract', () => {
  test('producer and consumer share one deterministic artifact', async () => {
    const producer = await readWorkflow('quality-checks.yml')
    const consumer = await readWorkflow('cross-platform-test.yml')

    expect(artifactName(producer, 'upload')).toBe('geeto-binaries')
    expect(artifactName(consumer, 'download')).toBe('geeto-binaries')
    expect(producer).not.toContain('matrix.node-version')
    expect(consumer).toContain('github-token: ${{ secrets.GITHUB_TOKEN }}')
    expect(consumer).toContain('run-id: ${{ github.event.workflow_run.id }}')
  })

  test('uploaded files and native smoke targets match geeto:build:all outputs', async () => {
    const producer = await readWorkflow('quality-checks.yml')
    const consumer = await readWorkflow('cross-platform-test.yml')
    const expectedBinaries = expectedTargets.map((target) => target.binary)

    expect(uploadedFiles(producer)).toEqual(expectedBinaries)
    expect(smokeTargets(consumer)).toEqual(expectedTargets)
    expect(consumer).toContain('chmod +x "${{ matrix.binary }}"')
    expect(consumer).toContain('./${{ matrix.binary }} --help')
    expect(consumer).toContain('.\\${{ matrix.binary }} --help')
  })
})
