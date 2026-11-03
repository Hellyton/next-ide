// Compiles the Swift dictation helper into resources/bin. Skips (with a warning, never a failure)
// off macOS or without swiftc, so the rest of the app still builds; a real compile error fails.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'native', 'dictation', 'main.swift')
const out = join(root, 'resources', 'bin', 'next-ide-dictation')

if (process.platform !== 'darwin') {
  console.log('[next-ide] dictation helper skipped (not macOS)')
  process.exit(0)
}
// Universal (arm64 + x86_64) so the same helper ships in the Apple Silicon and the Intel app.
const isUniversal = () => {
  try {
    const archs = execFileSync('lipo', ['-archs', out], { encoding: 'utf8' }).trim().split(/\s+/)
    return archs.includes('arm64') && archs.includes('x86_64')
  } catch {
    return false
  }
}
if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs && isUniversal()) process.exit(0)
try {
  execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' })
} catch {
  console.warn('[next-ide] swiftc not found; dictation button will report the helper as missing')
  process.exit(0)
}
mkdirSync(dirname(out), { recursive: true })
const slices = ['arm64', 'x86_64'].map((arch) => {
  const slice = `${out}-${arch}`
  execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, src, '-o', slice], { stdio: 'inherit' })
  return slice
})
execFileSync('lipo', ['-create', ...slices, '-output', out], { stdio: 'inherit' })
for (const slice of slices) rmSync(slice)
console.log(`[next-ide] built ${out} (arm64 + x86_64)`)
