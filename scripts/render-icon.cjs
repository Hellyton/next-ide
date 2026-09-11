// Renders build/icon.svg to resources/icon.png (1024x1024, transparent) and resources/icon.icns.
// Run with: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
const outDir = join(root, 'resources')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  win.webContents.setFrameRate(1)
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 300))
  const image = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 })
  mkdirSync(outDir, { recursive: true })
  const png = join(outDir, 'icon.png')
  writeFileSync(png, image.toPNG())

  const iconset = join(mkdtempSync(join(tmpdir(), 'next-ide-icon-')), 'icon.iconset')
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(size), String(size), png, '--out', join(iconset, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
    execFileSync('sips', ['-z', String(size * 2), String(size * 2), png, '--out', join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, 'icon.icns')])
  console.log('wrote resources/icon.png and resources/icon.icns')
  app.quit()
})
