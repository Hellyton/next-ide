// Dev only (the app is not packaged): it runs inside node_modules/electron's Electron.app, so macOS
// shows that bundle's name ("Electron") and icon in the menu bar and Dock. Swap them for next-ide's.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = join(appDir, 'Contents', 'Info.plist')
const icns = join(root, 'resources', 'icon.icns')
if (!existsSync(plist) || !existsSync(icns)) process.exit(0)

// The menu bar and Dock read CFBundleName. Electron still finds its helpers: it looks for
// "Electron Helper.app" (its product name) before "<CFBundleName> Helper.app".
for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', 'next-ide', plist])
copyFileSync(icns, join(appDir, 'Contents', 'Resources', 'electron.icns'))
// Editing the bundle invalidates its signature; re-sign ad hoc so macOS keeps launching it.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appDir], { stdio: 'ignore' })
// Make LaunchServices (Dock, menu bar, Cmd+Tab) drop the cached "Electron" name and icon.
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
if (existsSync(lsregister)) execFileSync(lsregister, ['-f', appDir], { stdio: 'ignore' })
execFileSync('touch', [appDir])
console.log('[next-ide] branded dev Electron.app')
