import { colors } from '../utils/colors.js'
import { log } from '../utils/logging.js'
import {
  compareVersions,
  detectInstallMethod,
  fetchLatestVersion,
  methodLabel,
  performUpdate,
} from '../utils/update-checker.js'
import { VERSION } from '../version.js'

export async function handleUpdate(): Promise<void> {
  const method = detectInstallMethod()

  console.log(`\n  ${colors.bright}Geeto${colors.reset} ${colors.gray}v${VERSION}${colors.reset}`)
  console.log(`  ${colors.gray}Install: ${methodLabel(method)}${colors.reset}`)
  console.log('')

  const spinner = log.spinner()
  spinner.start('Checking for updates...')

  const latestVersion = await fetchLatestVersion(method)

  spinner.stop()

  if (!latestVersion) {
    log.error('Failed to check for updates. Check your internet connection.')
    process.exit(1)
  }

  if (compareVersions(latestVersion, VERSION) <= 0) {
    log.success(`Already up to date (v${VERSION})`)
    process.exit(0)
  }

  log.info(`New version available: v${VERSION} → ${colors.green}v${latestVersion}${colors.reset}`)
  console.log('')

  await performUpdate(latestVersion, method)

  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exit(0)
  }
}
