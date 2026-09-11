export type Project = { id: string; name: string; path: string }

export type Workspace = { id: string; name: string; projects: Project[]; collapsed: boolean }

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk'

export type AgentPanelParams = {
  type: 'agent'
  projectPath: string
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
}
export type TerminalPanelParams = { type: 'terminal'; projectPath: string }
export type FilePanelParams = { type: 'file'; projectPath: string; filePath: string; line?: number }
export type PanelParams = AgentPanelParams | TerminalPanelParams | FilePanelParams
export type PanelType = PanelParams['type']

export type StatusSegmentId =
  | 'project'
  | 'branch'
  | 'model'
  | 'context'
  | 'tokens'
  | 'cost'
  | 'duration'
  | 'mode'
  | 'state'
  | 'customScript'

export type Settings = {
  claudePath?: string
  defaultModel?: string
  defaultPermissionMode: PermissionMode
  statusline: { segments: StatusSegmentId[]; customScript: boolean }
  theme: 'dark' | 'light' | 'system'
}

export const DEFAULT_SETTINGS: Settings = {
  defaultPermissionMode: 'default',
  statusline: {
    segments: ['project', 'branch', 'model', 'context', 'cost', 'duration', 'state'],
    customScript: false,
  },
  theme: 'dark',
}

/** `dock` is dockview's SerializedDockview; kept opaque outside the renderer. */
export type LayoutState = { version: 1; dock: unknown }

export type GitInfo = { branch: string | null }

export type SessionState = 'starting' | 'idle' | 'running' | 'awaiting_permission' | 'error' | 'exited'
