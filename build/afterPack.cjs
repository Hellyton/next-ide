// Ad-hoc signature as a baseline. When a Developer ID certificate is available, electron-builder
// re-signs over it (hardened runtime); without one, this keeps the app launchable from the DMG.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' })
  console.log(`  • ad-hoc signed  ${app}`)
}
