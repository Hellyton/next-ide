// Compiles the Swift dictation helper into resources/bin. Skips (with a warning, never a failure)
// off macOS or without swiftc, so the rest of the app still builds; a real compile error fails.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'native', 'dictation', 'main.swift')
const out = join(root, 'resources', 'bin', 'next-ide-dictation')

if (process.platform !== 'darwin') {
  console.log('[next-ide] dictation helper skipped (not macOS)')
  process.exit(0)
}
if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) process.exit(0)
try {
  execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' })
} catch {
  console.warn('[next-ide] swiftc not found; dictation button will report the helper as missing')
  process.exit(0)
}
mkdirSync(dirname(out), { recursive: true })
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, src, '-o', out], { stdio: 'inherit' })
console.log(`[next-ide] built ${out}`)
