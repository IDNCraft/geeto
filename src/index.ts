#!/usr/bin/env node
/**
 * Geeto - Git flow automation CLI tool with AI-powered branch naming
 * Main entry point - delegates to modular workflows via command registry
 */
import type { ParsedArgs } from './cli/command-registry.js'

import {
  buildValidFlags,
  COMMAND_REGISTRY,
  executeRegisteredCommand,
  parseArgs,
  renderHelpMessage,
} from './cli/command-registry.js'
import { checkForUpdate, getVersionHint, promptUpdate } from './utils/update-checker.js'
import { VERSION } from './version.js'

const validFlags = buildValidFlags()

async function handleDryRunSetup(args: ParsedArgs): Promise<void> {
  const { setDryRun, printDryRunBanner, printDryRunSummary } = await import('./utils/dry-run.js')

  const hasOtherCommand = args.startAt !== undefined || args.activeFlags.size > 0

  if (!hasOtherCommand) {
    // Standalone --dry-run: show interactive menu
    try {
      const { handleDryRunMenu } = await import('./workflows/dry-run.js')
      await handleDryRunMenu()
      process.exit(0)
    } catch (error) {
      console.error('Dry-run error:', error)
      process.exit(1)
    }
  }

  // Combo mode: activate dry-run, let normal routing handle it
  setDryRun(true)
  printDryRunBanner()

  // Wrap process.exit to print summary before exiting
  const originalExit = process.exit
  process.exit = ((code?: number) => {
    printDryRunSummary()
    originalExit(code)
  }) as typeof process.exit
}

async function executeCommand(args: ParsedArgs): Promise<void> {
  // 1. Version with update hint (like clopen -v)
  if (args.showVersion) {
    console.log(`Geeto v${VERSION}`)
    try {
      const hint = await getVersionHint()
      if (hint) console.log(hint)
    } catch {
      /* silent */
    }
    process.exit(0)
  }

  // 2. Help (instant, no imports)
  if (args.showHelp) {
    console.log(renderHelpMessage(VERSION))
    process.exit(0)
  }

  // 3. Silent update check (skipped for --version/--help/--uninstall/--update)
  if (!args.activeFlags.has('--uninstall') && !args.activeFlags.has('--update')) {
    try {
      const updateInfo = await checkForUpdate()
      if (updateInfo?.hasUpdate) {
        await promptUpdate(updateInfo)
      }
    } catch {
      /* silently ignore update check errors */
    }
  }

  // 4. Dry-run mode setup (must run before other commands)
  if (args.dryRunMode) {
    await handleDryRunSetup(args)
  }

  // 5. Registry commands — first match wins
  const command = COMMAND_REGISTRY.find(
    (entry) => entry.kind === 'module' && args.activeFlags.has(entry.flag)
  )
  if (command?.kind === 'module') {
    try {
      await executeRegisteredCommand(command, args.positionals)
      process.exit(0)
    } catch (error) {
      console.error(`${command.errorLabel} error:`, error)
      process.exit(1)
    }
  }

  // 6. Default: run main workflow
  const { main } = await import('./workflows/main.js')
  main({
    startAt: args.startAt,
    fresh: args.fresh,
    resume: args.resume,
    stageAll: args.stageAll,
  }).catch((error: unknown) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

// Entry point
const argv = process.argv.slice(2)

// Validate unknown flags
for (const arg of argv) {
  if (arg.startsWith('-') && !validFlags.has(arg)) {
    console.error(`Unknown flag: ${arg}`)
    console.error('Use --help to see available options')
    process.exit(1)
  }
}

const args = parseArgs(argv)
void executeCommand(args)
