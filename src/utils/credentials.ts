import fs from 'node:fs'
import path from 'node:path'

const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const IS_POSIX = process.platform !== 'win32'

export const ensurePrivateDirectory = (directory: string): void => {
  fs.mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
  if (IS_POSIX) fs.chmodSync(directory, PRIVATE_DIRECTORY_MODE)
}

export const writeCredentialFile = (filePath: string, content: string): void => {
  ensurePrivateDirectory(path.dirname(filePath))

  if (IS_POSIX && fs.existsSync(filePath)) fs.chmodSync(filePath, PRIVATE_FILE_MODE)
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: PRIVATE_FILE_MODE })
  if (IS_POSIX) fs.chmodSync(filePath, PRIVATE_FILE_MODE)
}
