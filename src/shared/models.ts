export type Project = { id: string; name: string; path: string }

export type Workspace = { id: string; name: string; projects: Project[]; collapsed: boolean }

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk'

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type EffortLevel = (typeof EFFORT_LEVELS)[number]
export const isEffortLevel = (v: string): v is EffortLevel => (EFFORT_LEVELS as readonly string[]).includes(v)

export type AgentPanelParams = {
  type: 'agent'
  projectPath: string
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
  effort?: EffortLevel
  title?: string
  additionalDirectories?: string[]
}
export type TerminalPanelParams = { type: 'terminal'; projectPath: string; initialCommand?: string }
export type FilePanelParams = { type: 'file'; projectPath: string; filePath: string; line?: number }
export type PanelParams = AgentPanelParams | TerminalPanelParams | FilePanelParams
export type PanelType = PanelParams['type']

export const STATUS_SEGMENTS = ['project', 'branch', 'model', 'context', 'tokens', 'duration', 'mode'] as const
export type StatusSegmentId = (typeof STATUS_SEGMENTS)[number] | 'customScript'

/** Drops ids that are no longer offered (e.g. 'cost', 'state' saved by older versions). */
export const sanitizeSegments = (ids: readonly string[]): StatusSegmentId[] =>
  ids.filter((id): id is StatusSegmentId => (STATUS_SEGMENTS as readonly string[]).includes(id))

export const SETTINGS_VERSION = 2

export type Settings = {
  /** Bumped when a default changes and older files must be upgraded (see migrateSettings). */
  settingsVersion?: number
  claudePath?: string
  defaultModel?: string
  defaultPermissionMode: PermissionMode
  statusline: { segments: StatusSegmentId[]; customScript: boolean }
  /** Sidebar width in px (drag handle between the sidebar and the dock). */
  sidebarWidth?: number
  theme: 'dark' | 'light' | 'system'
  /** macOS notifications when a panel finishes, asks for permission or fails while the window is in the background. Default on. */
  notifications?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  defaultPermissionMode: 'auto',
  statusline: {
    segments: ['project', 'branch', 'model', 'context', 'duration'],
    customScript: false,
  },
  theme: 'dark',
}

/** v2: new chats start in auto mode; files written before it carry the old 'default'. */
export function migrateSettings(settings: Settings): Settings {
  if ((settings.settingsVersion ?? 1) >= SETTINGS_VERSION) return settings
  return { ...settings, settingsVersion: SETTINGS_VERSION, defaultPermissionMode: 'auto' }
}

/** `dock` is dockview's SerializedDockview; kept opaque outside the renderer. */
export type LayoutState = { version: 1; dock: unknown }

export type GitInfo = { branch: string | null }

export type SessionState = 'starting' | 'idle' | 'running' | 'awaiting_permission' | 'error' | 'exited'
