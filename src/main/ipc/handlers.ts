import type { StatusLineInput } from '@shared/agent'
import type { Handlers } from '@shared/ipc-contract'
import { sanitizeLayout } from '@shared/layout'
import { DEFAULT_SETTINGS, isEffortLevel, migrateSettings, sanitizeSegments, type GitInfo, type Workspace } from '@shared/models'
import type { AgentManager } from '../agent/AgentManager'
import { historyToEvents } from '../agent/normalize'
import { forkPointBefore } from '../agent/rewind'
import type { SessionStoreApi } from '../agent/sdk'
import type { FilesService } from '../fs/FilesService'
import type { PtyManager } from '../pty/PtyManager'
import { parseCodeWorkspace } from '../store/codeWorkspace'
import type { Stores } from '../store/stores'

export type HandlerDeps = {
  stores: Stores
  pty: Pick<PtyManager, 'create' | 'write' | 'resize' | 'kill'>
  pickFolders: () => Promise<string[]>
  pickWorkspaceFile: () => Promise<string | null>
  readTextFile: (path: string) => Promise<string>
  gitInfo: (cwd: string) => Promise<GitInfo>
  agents: Pick<AgentManager, 'create' | 'get' | 'close'>
  sessions: SessionStoreApi
  agentReady: () => Promise<void>
  runStatusLine: (input: StatusLineInput) => Promise<string | null>
  files: Pick<FilesService, 'list' | 'read' | 'write' | 'index' | 'status'>
  onWorkspaces: (workspaces: Workspace[]) => void
  /** Main owns the notifications toggle (menu + settings), so `settings:save` never lets a stale renderer copy clobber it. */
  notificationsEnabled: () => boolean
}

const failed = (err: unknown) => ({ ok: false as const, message: err instanceof Error ? err.message : String(err) })
const cleanTitle = (title: string): string => title.replace(/\s*[\r\n]+\s*/g, ' ').trim()

export function buildHandlers(d: HandlerDeps): Handlers {
  return {
    'workspace:get': () => d.stores.workspaces.read(),
    'workspace:save': (workspaces) => {
      d.onWorkspaces(workspaces)
      return d.stores.workspaces.schedule(workspaces)
    },
    'settings:get': async () => {
      const stored = await d.stores.settings.read()
      const statusline = { ...DEFAULT_SETTINGS.statusline, ...stored.statusline }
      const merged = { ...DEFAULT_SETTINGS, ...stored, statusline: { ...statusline, segments: sanitizeSegments(statusline.segments) } }
      // The stored version decides the upgrade; the defaults above always carry the current one.
      const settings = migrateSettings({ ...merged, settingsVersion: stored.settingsVersion })
      // Write it back so the upgrade happens once, not on every read.
      if (settings.settingsVersion !== stored.settingsVersion) await d.stores.settings.writeNow(settings)
      return settings
    },
    // `notifications` is main's, not the renderer's: the renderer caches its whole Settings snapshot once
    // and re-sends it on every unrelated change (e.g. a sidebar resize), which would otherwise overwrite a
    // menu toggle made after that snapshot was taken.
    'settings:save': (settings) => d.stores.settings.writeNow({ ...settings, notifications: d.notificationsEnabled() }),
    'layout:get': async () => sanitizeLayout(await d.stores.layout.read()),
    'layout:save': (layout) => d.stores.layout.schedule(layout),
    'fs:pickFolder': () => d.pickFolders(),
    'fs:pickWorkspaceFile': async () => {
      const file = await d.pickWorkspaceFile()
      if (!file) return null
      return parseCodeWorkspace(await d.readTextFile(file), file)
    },
    'git:info': (projectPath) => d.gitInfo(projectPath),
    'fs:list': (projectPath, dir) => d.files.list(projectPath, dir),
    'fs:read': (path) => d.files.read(path),
    'fs:index': (projectPath) => d.files.index(projectPath),
    'fs:write': async (path, content) => {
      try {
        await d.files.write(path, content)
        return { ok: true as const }
      } catch (err) {
        return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
      }
    },
    'git:status': (projectPath) => d.files.status(projectPath),
    'pty:create': (panelId, cwd, cols, rows) => d.pty.create(panelId, cwd, cols, rows),
    'pty:write': (panelId, data) => d.pty.write(panelId, data),
    'pty:resize': (panelId, cols, rows) => d.pty.resize(panelId, cols, rows),
    'pty:kill': (panelId) => d.pty.kill(panelId),
    'agent:create': async (panelId, params) => {
      await d.agentReady()
      // A brand-new panel has no mode of its own: start it in the configured default (auto).
      const stored = await d.stores.settings.read()
      const mode = params.permissionMode ?? migrateSettings({ ...DEFAULT_SETTINGS, ...stored, settingsVersion: stored.settingsVersion }).defaultPermissionMode
      d.agents.create(panelId, { ...params, permissionMode: mode })
    },
    'agent:start': async (panelId) => {
      await d.agentReady()
      d.agents.get(panelId).start()
    },
    'agent:send': async (panelId, text, images) => {
      await d.agentReady()
      d.agents.get(panelId).send(text, images)
    },
    'agent:interrupt': (panelId) => d.agents.get(panelId).interrupt(),
    'agent:setModel': (panelId, model) => d.agents.get(panelId).setModel(model),
    'agent:setMode': (panelId, mode) => d.agents.get(panelId).setMode(mode),
    'agent:setEffort': async (panelId, effort) => {
      // null = automatic; anything else must be a known level.
      if (effort !== null && !isEffortLevel(effort)) return
      await d.agents.get(panelId).setEffort(effort)
    },
    'agent:respondPermission': (panelId, requestId, decision) => d.agents.get(panelId).respondPermission(requestId, decision),
    'agent:commands': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).commands()
    },
    'agent:models': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).models()
    },
    'agent:usage': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).usage()
    },
    'agent:btw': async (panelId, question) => {
      await d.agentReady()
      return d.agents.get(panelId).btw(question)
    },
    'agent:btwCancel': (panelId) => d.agents.get(panelId).cancelBtw(),
    'agent:contextUsage': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).contextUsage()
    },
    'agent:rewindFiles': async (panelId, userMessageId, dryRun) => {
      await d.agentReady()
      return d.agents.get(panelId).rewindFiles(userMessageId, dryRun)
    },
    'agent:stopTask': (panelId, taskId) => d.agents.get(panelId).stopTask(taskId),
    'agent:background': (panelId) => d.agents.get(panelId).backgroundTasks(),
    'agent:mcpServers': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).mcpServers()
    },
    'agent:toggleMcp': (panelId, name, enabled) => d.agents.get(panelId).toggleMcp(name, enabled),
    'agent:reconnectMcp': (panelId, name) => d.agents.get(panelId).reconnectMcp(name),
    'agent:agents': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).agents()
    },
    'agent:listSessions': async (projectPath) => {
      await d.agentReady()
      return d.sessions.list(projectPath)
    },
    'agent:history': async (projectPath, sessionId) => {
      await d.agentReady()
      return historyToEvents(await d.sessions.history(projectPath, sessionId))
    },
    'agent:forkBefore': async (projectPath, sessionId, userMessageId, title) => {
      await d.agentReady()
      try {
        const point = forkPointBefore(await d.sessions.history(projectPath, sessionId), userMessageId)
        if (point === null) return { ok: true as const, value: { sessionId: null, history: [] } }
        const forked = await d.sessions.fork(projectPath, sessionId, point, title)
        return { ok: true as const, value: { sessionId: forked, history: historyToEvents(await d.sessions.history(projectPath, forked)) } }
      } catch (err) {
        return failed(err)
      }
    },
    'agent:fork': async (projectPath, sessionId, title) => {
      await d.agentReady()
      try {
        const clean = title === undefined ? undefined : cleanTitle(title) || undefined
        return { ok: true as const, value: await d.sessions.fork(projectPath, sessionId, undefined, clean) }
      } catch (err) {
        return failed(err)
      }
    },
    'agent:rename': async (projectPath, sessionId, title) => {
      const clean = cleanTitle(title)
      if (!clean) return { ok: false as const, message: 'Título vazio.' }
      await d.agentReady()
      try {
        await d.sessions.rename(projectPath, sessionId, clean)
        return { ok: true as const, value: null }
      } catch (err) {
        return failed(err)
      }
    },
    'agent:close': (panelId) => d.agents.close(panelId),
    'statusline:run': (input) => d.runStatusLine(input),
  }
}
