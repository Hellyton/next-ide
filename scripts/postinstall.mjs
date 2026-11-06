// Cross-platform postinstall (npm runs scripts through cmd.exe on Windows, so no shell syntax here).
// macOS: node-pty's spawn helper must be executable, and the dev Electron.app gets the app's name/icon.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const prebuilds = join(root, 'node_modules', 'node-pty', 'prebuilds')
try {
  for (const dir of readdirSync(prebuilds).filter((d) => d.startsWith('darwin-'))) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
} catch {
  // no prebuilds: nothing to fix
}
try {
  execFileSync(process.execPath, [join(root, 'scripts', 'brand-electron.mjs')], { stdio: 'inherit' })
} catch {
  // branding is cosmetic (dev only); never fail the install over it
}
