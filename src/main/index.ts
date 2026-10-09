import { app, BrowserWindow, dialog, ipcMain, Notification, shell, type MessageBoxSyncOptions } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, delimiter, join } from 'node:path'
import type { EventChannel, EventMap } from '@shared/ipc-contract'
import { clampBlur, clampTransparency, type Settings } from '@shared/models'
import { projectPaths } from '@shared/workspaces'
import { AgentManager } from './agent/AgentManager'
import type { QueryFn } from './agent/AgentSession'
import { fakeQuery, fakeSessions } from './agent/fakeQuery'
import { AgentNotifier } from './agent/notifications'
import { loadSdk, type SessionStoreApi } from './agent/sdk'
import { DictationManager } from './dictation/DictationManager'
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
import { setWindowBlur } from './windowBlur'
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

let notificationsEnabled = true
let windowTransparency = 0
let windowBlur = 0
// Serializes the menu toggle's read-modify-write of settings.json so rapid clicks can't race each
// other (a `read()` started before an earlier toggle's `writeNow()` lands would otherwise clobber it).
let settingsWriteChain: Promise<unknown> = Promise.resolve()

// Electron's Notification has no owner on the JS side once `show()` returns; without a strong
// reference here it can be GC'd before the user clicks it, silently dropping the click → focus
// behavior. Keep every live one until it resolves (click, close, or failure). Keyed by panelId
// (not a Set) so a busy panel can't stack up an unbounded pile of notifications: a new one for
// the same panel closes the previous one first.
const liveNotifications = new Map<string, Notification>()

const notifier = new AgentNotifier({
  isFocused: () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()),
  enabled: () => notificationsEnabled && Notification.isSupported(),
  projectOf: (panelId) => agents.projectOf(panelId),
  show: ({ title, body, panelId }) => {
    liveNotifications.get(panelId)?.close()
    const n = new Notification({ title, body, silent: false })
    liveNotifications.set(panelId, n)
    // Guard every removal: `close()` above fires its old notification's own 'close' handler
    // asynchronously, which must not delete the new entry it raced with.
    const forget = () => {
      if (liveNotifications.get(panelId) === n) liveNotifications.delete(panelId)
    }
    n.on('click', () => {
      forget()
      const win = mainWindow
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      send('agent:focus', panelId)
    })
    n.on('close', forget)
    n.on('failed', forget)
    n.show()
  },
})

const agents = new AgentManager({
  emit: (panelId, event) => {
    // The renderer must always get the event; a Notification failure (unsupported platform,
    // OS-level error) can't be allowed to desync it.
    send('agent:event', panelId, event)
    try {
      notifier.onEvent(panelId, event)
    } catch (err) {
      console.error('[next-ide] notifier failed', err)
    }
    if (event.kind === 'status' && event.state === 'exited') notifier.forget(panelId)
  },
  runtime: () => ({
    queryFn: (params) => requireSdk().queryFn(params),
    // The CLI's /resume picker hides sessions whose entrypoint is sdk-*; the SDK only sets
    // 'sdk-ts' when this is unset, so chats started here would never show up there.
    env: { ...shellEnv(process.env), CLAUDE_CODE_ENTRYPOINT: 'cli' },
    ...(claudePath ? { claudePath } : {}),
  }),
})

// Swift helper built by scripts/build-dictation.mjs; E2E swaps in a Node fake with the same protocol.
const FAKE_DICTATION = process.env.NEXT_IDE_E2E_FAKE_DICTATION
const dictationBin = app.isPackaged
  ? join(process.resourcesPath, 'bin', 'next-ide-dictation')
  : join(app.getAppPath(), 'resources', 'bin', 'next-ide-dictation')
const dictation = new DictationManager({
  exists: () => Boolean(FAKE_DICTATION) || existsSync(dictationBin),
  spawn: () =>
    FAKE_DICTATION
      ? spawn(process.execPath, [join(app.getAppPath(), 'test', 'fixtures', 'fakeDictation.mjs'), FAKE_DICTATION], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'pipe', 'inherit'],
        })
      : spawn(dictationBin, ['--locale', 'pt-BR'], { stdio: ['ignore', 'pipe', 'inherit'] }),
  emit: (panelId, event) => send('dictation:event', panelId, event),
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
      fork: (dir, id, upTo, title) => requireSdk().fork(dir, id, upTo, title),
      rename: (dir, id, title) => requireSdk().rename(dir, id, title),
    },
    agentReady: () => agentReady,
    runStatusLine: (input) =>
      runStatusLine(input, process.env.NEXT_IDE_CLAUDE_SETTINGS ? { settingsPath: process.env.NEXT_IDE_CLAUDE_SETTINGS } : {}),
    files,
    onWorkspaces: (ws) => setProjects(projectPaths(ws)),
    notificationsEnabled: () => notificationsEnabled,
    windowTransparency: () => windowTransparency,
    windowBlur: () => windowBlur,
    dictation,
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
    // See-through from the start: transparency is the renderer's surface alpha (text stays solid) and
    // a window can't become transparent later.
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void setWindowBlur(win, windowBlur)
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

void app.whenReady().then(async () => {
  // Dev only: unpackaged, the Dock would show the stock Electron icon (packaged, the bundle has it).
  if (!app.isPackaged) {
    try {
      app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
    } catch (err) {
      console.error('[next-ide] failed to set dock icon', err)
    }
  }
  // A settings.json read failure (bad permissions, disk hiccup, or an on-disk value that parses
  // but isn't the object we expect) must never block the window from opening.
  let settingsNotifications: boolean | undefined
  try {
    const settings: unknown = await stores.settings.read()
    if (settings && typeof settings === 'object') {
      settingsNotifications = (settings as { notifications?: boolean }).notifications
      windowTransparency = clampTransparency((settings as { windowTransparency?: unknown }).windowTransparency)
      windowBlur = clampBlur((settings as { windowBlur?: unknown }).windowBlur)
    }
  } catch (err) {
    console.error('[next-ide] failed to read settings at startup', err)
  }
  notificationsEnabled = settingsNotifications !== false
  const persist = (patch: Partial<Settings>) => {
    settingsWriteChain = settingsWriteChain
      .then(() => stores.settings.read())
      .then((s) => stores.settings.writeNow({ ...s, ...patch }))
      .catch((err) => console.error('[next-ide] failed to persist menu setting', err))
  }
  installMenu({
    notifications: notificationsEnabled,
    onToggleNotifications: (enabled) => {
      notificationsEnabled = enabled
      persist({ notifications: enabled })
    },
    transparency: windowTransparency,
    onTransparency: (percent) => {
      windowTransparency = percent
      send('window:transparency', percent)
      persist({ windowTransparency: percent })
    },
    blur: windowBlur,
    onBlur: (percent) => {
      windowBlur = percent
      if (mainWindow && !mainWindow.isDestroyed()) void setWindowBlur(mainWindow, percent)
      persist({ windowBlur: percent })
    },
  })
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
    dictation.stopAll()
  } catch (err) {
    console.error('[next-ide] stopping dictation failed', err)
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
