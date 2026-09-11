import { app, BrowserWindow, dialog, ipcMain, shell, type MessageBoxSyncOptions } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventChannel, EventMap } from '@shared/ipc-contract'
import { AgentManager } from './agent/AgentManager'
import type { QueryFn } from './agent/AgentSession'
import { fakeQuery, fakeSessions } from './agent/fakeQuery'
import { loadSdk, type SessionStoreApi } from './agent/sdk'
import { loginShellPath, mergePath, resolveClaudePath } from './env/loginShell'
import { gitInfo } from './git/gitInfo'
import { buildHandlers } from './ipc/handlers'
import { registerHandlers } from './ipc/register'
import { installMenu } from './menu'
import { isAllowedNavigation } from './navigation'
import { PtyManager } from './pty/PtyManager'
import { createQuitGuard } from './quitGuard'
import { shellEnv } from './pty/shellEnv'
import { spawnShell } from './pty/spawnShell'
import { runStatusLine } from './statusline/runStatusLine'
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

type Sdk = { queryFn: QueryFn } & SessionStoreApi
const FAKE_AGENT = process.env.NEXT_IDE_FAKE_AGENT === '1'
let sdk: Sdk | null = null
let claudePath: string | undefined
const agentReady: Promise<void> = (async () => {
  process.env.PATH = mergePath(process.env.PATH, await loginShellPath())
  if (FAKE_AGENT) {
    sdk = { queryFn: fakeQuery, ...fakeSessions }
    return
  }
  claudePath = await resolveClaudePath((await stores.settings.read()).claudePath)
  sdk = await loadSdk()
})()
agentReady.catch((err) => console.error('[next-ide] failed to prepare Claude Agent SDK', err))

const requireSdk = (): Sdk => {
  if (!sdk) throw new Error('O SDK do Claude ainda não carregou.')
  return sdk
}

const agents = new AgentManager({
  emit: (panelId, event) => send('agent:event', panelId, event),
  runtime: () => ({
    queryFn: (params) => requireSdk().queryFn(params),
    env: shellEnv(process.env),
    ...(claudePath ? { claudePath } : {}),
  }),
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
    agents,
    sessions: { list: (dir) => requireSdk().list(dir), history: (dir, id) => requireSdk().history(dir, id) },
    agentReady: () => agentReady,
    runStatusLine: (input) =>
      runStatusLine(input, process.env.NEXT_IDE_CLAUDE_SETTINGS ? { settingsPath: process.env.NEXT_IDE_CLAUDE_SETTINGS } : {}),
  }),
)

let quitting = false
const quitGuard = createQuitGuard<BrowserWindow>({
  hasBusy: () => agents.hasBusy(),
  skipConfirm: () => process.env.NEXT_IDE_E2E_NO_QUIT_CONFIRM === '1',
  ask: (parent) => {
    const options: MessageBoxSyncOptions = {
      type: 'warning',
      buttons: ['Sair', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: 'Há agentes trabalhando.',
      detail: 'Sair agora interrompe as sessões em andamento.',
    }
    const choice = parent && !parent.isDestroyed() ? dialog.showMessageBoxSync(parent, options) : dialog.showMessageBoxSync(options)
    return choice === 0
  },
})

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
  // Closing the only window quits the app (see window-all-closed); confirm first if agents are busy.
  win.on('close', (event) => {
    if (!quitting && !quitGuard.allowWindowClose(win)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, win.webContents.getURL())) event.preventDefault()
  })
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, win.webContents.getURL())) event.preventDefault()
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

app.on('before-quit', (event) => {
  if (quitting) return
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  if (!quitGuard.allowQuit(win)) {
    event.preventDefault()
    return
  }
  event.preventDefault()
  quitting = true
  try {
    agents.closeAll()
  } catch (err) {
    console.error('[next-ide] closeAll failed', err)
  }
  try {
    ptys.killAll()
  } catch (err) {
    console.error('[next-ide] killAll failed', err)
  }
  void Promise.allSettled([stores.workspaces.flush(), stores.layout.flush(), stores.settings.flush()]).finally(() => app.quit())
})

// Single-window IDE: closing the window quits on macOS too, so sessions and ptys are torn
// down by the before-quit path instead of lingering with no UI.
app.on('window-all-closed', () => app.quit())
