import { app, BrowserWindow, dialog, ipcMain, shell, type MessageBoxSyncOptions } from 'electron'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, delimiter, join } from 'node:path'
import type { EventChannel, EventMap } from '@shared/ipc-contract'
import { projectPaths } from '@shared/workspaces'
import { AgentManager } from './agent/AgentManager'
import type { QueryFn } from './agent/AgentSession'
import { fakeQuery, fakeSessions } from './agent/fakeQuery'
import { loadSdk, type SessionStoreApi } from './agent/sdk'
import { loginShellPath, mergePath, resolveClaudePath } from './env/loginShell'
import { FilesService } from './fs/FilesService'
import { validRoots } from './fs/validRoots'
import { WatcherManager, type WatchFn } from './fs/WatcherManager'
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

app.setName('next-ide')
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

// Project folders the renderer may read. Kept in memory (not re-read from the debounced
// store) so a folder added a moment ago is readable right away.
let roots: string[] = []
let rootsReady: Promise<void> = Promise.resolve()

const files = new FilesService(async () => {
  await rootsReady
  return roots
})

const watchFs: WatchFn = (root, onChange) => {
  const watcher = watch(root, { recursive: true }, (_event, filename) => onChange(filename ? filename.toString() : null))
  watcher.on('error', (err) => console.error('[next-ide] watcher error', root, err))
  return watcher
}

const watchers = new WatcherManager(watchFs, {
  fsChanged: (projectPath, paths) => {
    if (paths.some((p) => p === projectPath || basename(p) === '.gitignore')) files.invalidateIgnore(projectPath)
    send('fs:changed', projectPath, paths)
  },
  gitChanged: (projectPath) => send('git:changed', projectPath),
})

function setProjects(paths: string[]): void {
  roots = validRoots(paths)
  watchers.sync(roots)
}

rootsReady = stores.workspaces
  .read()
  .then((ws) => setProjects(projectPaths(ws)))
  .catch((err) => console.error('[next-ide] failed to read workspaces for file access', err))

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

async function pickFolders(): Promise<string[]> {
  const fake = process.env.NEXT_IDE_E2E_PICK_FOLDER
  if (fake) return fake.split(delimiter).filter(Boolean)
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory', 'multiSelections'] })
  return result.canceled ? [] : result.filePaths
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
    pickFolders,
    pickWorkspaceFile,
    readTextFile: (p) => readFile(p, 'utf8'),
    gitInfo,
    agents,
    sessions: {
      list: (dir) => requireSdk().list(dir),
      history: (dir, id) => requireSdk().history(dir, id),
      fork: (dir, id, upTo) => requireSdk().fork(dir, id, upTo),
      rename: (dir, id, title) => requireSdk().rename(dir, id, title),
    },
    agentReady: () => agentReady,
    runStatusLine: (input) =>
      runStatusLine(input, process.env.NEXT_IDE_CLAUDE_SETTINGS ? { settingsPath: process.env.NEXT_IDE_CLAUDE_SETTINGS } : {}),
    files,
    onWorkspaces: (ws) => setProjects(projectPaths(ws)),
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
  // Dev only: unpackaged, the Dock would show the stock Electron icon (packaged, the bundle has it).
  if (!app.isPackaged) {
    try {
      app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
    } catch (err) {
      console.error('[next-ide] failed to set dock icon', err)
    }
  }
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
  try {
    watchers.closeAll()
  } catch (err) {
    console.error('[next-ide] closing watchers failed', err)
  }
  void Promise.allSettled([stores.workspaces.flush(), stores.layout.flush(), stores.settings.flush()]).finally(() => app.quit())
})

// Single-window IDE: closing the window quits on macOS too, so sessions and ptys are torn
// down by the before-quit path instead of lingering with no UI.
app.on('window-all-closed', () => app.quit())
