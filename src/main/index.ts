import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventChannel, EventMap } from '@shared/ipc-contract'
import { gitInfo } from './git/gitInfo'
import { buildHandlers } from './ipc/handlers'
import { registerHandlers } from './ipc/register'
import { installMenu } from './menu'
import { PtyManager } from './pty/PtyManager'
import { spawnShell } from './pty/spawnShell'
import { createStores } from './store/stores'

if (process.env.NEXT_IDE_USER_DATA) app.setPath('userData', process.env.NEXT_IDE_USER_DATA)

let mainWindow: BrowserWindow | null = null

function send<K extends EventChannel>(channel: K, ...args: EventMap[K]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

const stores = createStores(app.getPath('userData'))
const ptys = new PtyManager(spawnShell, {
  data: (id, chunk) => send('pty:data', id, chunk),
  exit: (id, code) => send('pty:exit', id, code),
})

async function pickFolder(): Promise<string | null> {
  if (process.env.NEXT_IDE_E2E_PICK_FOLDER) return process.env.NEXT_IDE_E2E_PICK_FOLDER
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function pickWorkspaceFile(): Promise<string | null> {
  if (process.env.NEXT_IDE_E2E_PICK_WORKSPACE) return process.env.NEXT_IDE_E2E_PICK_WORKSPACE
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'VS Code Workspace', extensions: ['code-workspace'] }],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

registerHandlers(
  ipcMain,
  buildHandlers({
    stores,
    pty: ptys,
    pickFolder,
    pickWorkspaceFile,
    readTextFile: (p) => readFile(p, 'utf8'),
    gitInfo,
  }),
)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

void app.whenReady().then(() => {
  installMenu()
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  try {
    ptys.killAll()
  } catch (err) {
    console.error('[next-ide] killAll failed', err)
  }
  void Promise.allSettled([stores.workspaces.flush(), stores.layout.flush(), stores.settings.flush()]).finally(
    () => app.quit(),
  )
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
