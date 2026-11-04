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
export type GitPanelParams = { type: 'git'; projectPath: string }
export type PanelParams = AgentPanelParams | TerminalPanelParams | FilePanelParams | GitPanelParams
export type PanelType = PanelParams['type']

export const STATUS_SEGMENTS = ['project', 'branch', 'model', 'effort', 'context', 'tokens', 'duration', 'mode'] as const
export type StatusSegmentId = (typeof STATUS_SEGMENTS)[number] | 'customScript'

/** Drops ids that are no longer offered (e.g. 'cost', 'state' saved by older versions). */
export const sanitizeSegments = (ids: readonly string[]): StatusSegmentId[] =>
  ids.filter((id): id is StatusSegmentId => (STATUS_SEGMENTS as readonly string[]).includes(id))

export const SETTINGS_VERSION = 2

/** Last model/effort/mode chosen in a project's chat: new chats of that project start with it. */
export type ProjectAgentDefaults = { model?: string; effort?: EffortLevel; permissionMode?: PermissionMode }

/**
 * Folds a change into a project's defaults. Effort null (auto) clears it; bypass is never
 * remembered, so a new chat never starts without asking for permission.
 */
export function mergeProjectDefaults(
  current: ProjectAgentDefaults | undefined,
  patch: { model?: string; effort?: EffortLevel | null; permissionMode?: PermissionMode },
): ProjectAgentDefaults {
  const next: ProjectAgentDefaults = { ...current }
  if (patch.model !== undefined) next.model = patch.model
  if (patch.effort === null) delete next.effort
  else if (patch.effort !== undefined) next.effort = patch.effort
  if (patch.permissionMode !== undefined && patch.permissionMode !== 'bypassPermissions') next.permissionMode = patch.permissionMode
  return next
}

export type Settings = {
  /** Bumped when a default changes and older files must be upgraded (see migrateSettings). */
  settingsVersion?: number
  claudePath?: string
  defaultModel?: string
  defaultPermissionMode: PermissionMode
  /** Keyed by project path. */
  projectDefaults?: Record<string, ProjectAgentDefaults>
  statusline: { segments: StatusSegmentId[]; customScript: boolean }
  /** Sidebar width in px (drag handle between the sidebar and the dock). */
  sidebarWidth?: number
  /** Sidebar hidden via the toggle button or Cmd+B. */
  sidebarCollapsed?: boolean
  theme: 'dark' | 'light' | 'system'
  /** macOS notifications when a panel finishes, asks for permission or fails while the window is in the background. Default on. */
  notifications?: boolean
  /** Window transparency in percent (0 = opaque), picked in the Janela menu. */
  windowTransparency?: number
  /** Blur of whatever shows through the window, in percent (0 = sharp); only visible with some transparency. */
  windowBlur?: number
}

export const TRANSPARENCY_STEPS = [0, 5, 10, 15, 20, 30, 40, 50] as const
/** Past this the window is too faint to find and turn back. */
export const MAX_TRANSPARENCY = 70

export const BLUR_STEPS = [0, 10, 25, 50, 75, 100] as const
/** Window-server blur radius at 100%. */
export const MAX_BLUR_RADIUS = 60

export const clampBlur = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0

/** Anything that isn't a number (missing, hand-edited file) means opaque. */
export const clampTransparency = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round(value))) : 0

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  defaultPermissionMode: 'auto',
  statusline: {
    segments: ['project', 'branch', 'model', 'effort', 'context', 'duration'],
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
