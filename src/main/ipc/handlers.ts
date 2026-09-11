import type { Handlers } from '@shared/ipc-contract'
import { sanitizeLayout } from '@shared/layout'
import { DEFAULT_SETTINGS, type GitInfo } from '@shared/models'
import type { AgentManager } from '../agent/AgentManager'
import { historyToEvents } from '../agent/normalize'
import type { SessionStoreApi } from '../agent/sdk'
import type { PtyManager } from '../pty/PtyManager'
import { parseCodeWorkspace } from '../store/codeWorkspace'
import type { Stores } from '../store/stores'

export type HandlerDeps = {
  stores: Stores
  pty: Pick<PtyManager, 'create' | 'write' | 'resize' | 'kill'>
  pickFolder: () => Promise<string | null>
  pickWorkspaceFile: () => Promise<string | null>
  readTextFile: (path: string) => Promise<string>
  gitInfo: (cwd: string) => Promise<GitInfo>
  agents: Pick<AgentManager, 'create' | 'get' | 'close'>
  sessions: SessionStoreApi
  agentReady: () => Promise<void>
}

export function buildHandlers(d: HandlerDeps): Handlers {
  return {
    'workspace:get': () => d.stores.workspaces.read(),
    'workspace:save': (workspaces) => d.stores.workspaces.schedule(workspaces),
    'settings:get': async () => ({ ...DEFAULT_SETTINGS, ...(await d.stores.settings.read()) }),
    'settings:save': (settings) => d.stores.settings.writeNow(settings),
    'layout:get': async () => sanitizeLayout(await d.stores.layout.read()),
    'layout:save': (layout) => d.stores.layout.schedule(layout),
    'fs:pickFolder': () => d.pickFolder(),
    'fs:pickWorkspaceFile': async () => {
      const file = await d.pickWorkspaceFile()
      if (!file) return null
      return parseCodeWorkspace(await d.readTextFile(file), file)
    },
    'git:info': (projectPath) => d.gitInfo(projectPath),
    'pty:create': (panelId, cwd, cols, rows) => d.pty.create(panelId, cwd, cols, rows),
    'pty:write': (panelId, data) => d.pty.write(panelId, data),
    'pty:resize': (panelId, cols, rows) => d.pty.resize(panelId, cols, rows),
    'pty:kill': (panelId) => d.pty.kill(panelId),
    'agent:create': (panelId, params) => d.agents.create(panelId, params),
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
    'agent:respondPermission': (panelId, requestId, decision) => d.agents.get(panelId).respondPermission(requestId, decision),
    'agent:commands': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).commands()
    },
    'agent:models': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).models()
    },
    'agent:listSessions': async (projectPath) => {
      await d.agentReady()
      return d.sessions.list(projectPath)
    },
    'agent:history': async (projectPath, sessionId) => {
      await d.agentReady()
      return historyToEvents(await d.sessions.history(projectPath, sessionId))
    },
    'agent:close': (panelId) => d.agents.close(panelId),
  }
}
