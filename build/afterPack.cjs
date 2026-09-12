// The app is not signed with a Developer ID (personal tool). Sign it ad hoc before electron-builder
// wraps it into the DMG, so macOS launches it from the installed copy too.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' })
  console.log(`  • ad-hoc signed  ${app}`)
}
