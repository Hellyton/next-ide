import type { Handlers } from '@shared/ipc-contract'
import { DEFAULT_SETTINGS, type GitInfo } from '@shared/models'
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
}

export function buildHandlers(d: HandlerDeps): Handlers {
  return {
    'workspace:get': () => d.stores.workspaces.read(),
    'workspace:save': (workspaces) => d.stores.workspaces.schedule(workspaces),
    'settings:get': async () => ({ ...DEFAULT_SETTINGS, ...(await d.stores.settings.read()) }),
    'settings:save': (settings) => d.stores.settings.writeNow(settings),
    'layout:get': () => d.stores.layout.read(),
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
  }
}
