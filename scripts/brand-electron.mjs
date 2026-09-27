// Dev only (the app is not packaged): it runs inside node_modules/electron's Electron.app, so macOS
// shows that bundle's name ("Electron") and icon in the menu bar, the Dock and its tooltip.
// Rename the bundle (and its executable, which is what the Dock labels) and swap the icon.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)

const NAME = 'next-ide'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = join(root, 'node_modules', 'electron')
const appDir = join(electronDir, 'dist', 'Electron.app')
const plist = join(appDir, 'Contents', 'Info.plist')
const icns = join(root, 'resources', 'icon.icns')
if (!existsSync(plist) || !existsSync(icns)) process.exit(0)

// The menu bar and Cmd+Tab read CFBundleName; the Dock tooltip follows the executable's name.
// Electron still finds its helpers: it looks for "Electron Helper.app" (its product name) first.
for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', NAME, plist])
// Own bundle id too: LaunchServices caches the name/icon per id, and com.github.Electron is
// shared with every other Electron app on the machine (that cache is what kept saying "Electron").
execFileSync('plutil', ['-replace', 'CFBundleIdentifier', '-string', 'dev.nextide.app', plist])
const macos = join(appDir, 'Contents', 'MacOS')
if (existsSync(join(macos, 'Electron')) && !existsSync(join(macos, NAME))) renameSync(join(macos, 'Electron'), join(macos, NAME))
execFileSync('plutil', ['-replace', 'CFBundleExecutable', '-string', NAME, plist])
// Dictation: macOS credits mic/speech access to this bundle (the helper's parent) and refuses
// without usage strings in its Info.plist.
execFileSync('plutil', ['-replace', 'NSMicrophoneUsageDescription', '-string', 'O next-ide usa o microfone para o ditado por voz no composer.', plist])
execFileSync('plutil', ['-replace', 'NSSpeechRecognitionUsageDescription', '-string', 'O next-ide transcreve sua fala no próprio Mac para o ditado por voz.', plist])
// `require('electron')` resolves the binary through this file.
writeFileSync(join(electronDir, 'path.txt'), `Electron.app/Contents/MacOS/${NAME}`)
copyFileSync(icns, join(appDir, 'Contents', 'Resources', 'electron.icns'))
// Editing the bundle invalidates its signature; re-sign ad hoc so macOS keeps launching it.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appDir], { stdio: 'ignore' })
// Make LaunchServices (Dock, menu bar, Cmd+Tab) drop the cached "Electron" name and icon.
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
if (existsSync(lsregister)) execFileSync(lsregister, ['-f', appDir], { stdio: 'ignore' })
execFileSync('touch', [appDir])
console.log(`[next-ide] branded dev Electron.app as ${NAME}`)
