import type {
  AgentEvent,
  AgentInfo,
  CommandOption,
  ContextUsage,
  ImageAttachment,
  McpServer,
  ModelOption,
  Outcome,
  PermissionDecision,
  RewindFiles,
  SessionSummary,
  SessionUsage,
  SideAnswer,
  StatusLineInput,
} from './agent'
import type { DictationEvent } from './dictation'
import type { FileContent, FsEntry, GitFileStatus } from './files'
import type { GitBranches, GitCheckout, GitOverview, GitSyncAction } from './git'
import type { AgentPanelParams, EffortLevel, GitInfo, LayoutState, PermissionMode, Settings, Workspace } from './models'

export type InvokeMap = {
  'workspace:get': { args: []; result: Workspace[] }
  'workspace:save': { args: [workspaces: Workspace[]]; result: void }
  'settings:get': { args: []; result: Settings }
  'settings:save': { args: [settings: Settings]; result: void }
  'layout:get': { args: []; result: LayoutState | null }
  'layout:save': { args: [layout: LayoutState]; result: void }
  'fs:pickFolder': { args: []; result: string[] }
  'fs:pickWorkspaceFile': { args: []; result: { name: string; paths: string[] } | null }
  'git:info': { args: [projectPath: string]; result: GitInfo }
  'fs:list': { args: [projectPath: string, dir: string]; result: FsEntry[] }
  'fs:read': { args: [path: string]; result: FileContent }
  'fs:index': { args: [projectPath: string]; result: string[] }
  'fs:write': { args: [path: string, content: string]; result: { ok: true } | { ok: false; message: string } }
  'git:status': { args: [projectPath: string]; result: Record<string, GitFileStatus> }
  'git:overview': { args: [projectPath: string]; result: GitOverview }
  'git:branches': { args: [projectPath: string]; result: GitBranches }
  'git:checkout': { args: [projectPath: string, target: GitCheckout]; result: Outcome<null> }
  'git:diff': { args: [projectPath: string, path: string]; result: Outcome<string> }
  'git:commit': { args: [projectPath: string, paths: string[], summary: string, description: string]; result: Outcome<null> }
  'git:sync': { args: [projectPath: string, action: GitSyncAction]; result: Outcome<null> }
  'pty:create': { args: [panelId: string, cwd: string, cols: number, rows: number]; result: void }
  'pty:write': { args: [panelId: string, data: string]; result: void }
  'pty:resize': { args: [panelId: string, cols: number, rows: number]; result: void }
  'pty:kill': { args: [panelId: string]; result: void }
  'agent:create': { args: [panelId: string, params: AgentPanelParams]; result: void }
  'agent:start': { args: [panelId: string]; result: void }
  'agent:send': { args: [panelId: string, text: string, images: ImageAttachment[]]; result: void }
  'agent:interrupt': { args: [panelId: string]; result: void }
  'agent:setModel': { args: [panelId: string, model: string]; result: void }
  'agent:setMode': { args: [panelId: string, mode: PermissionMode]; result: void }
  'agent:setEffort': { args: [panelId: string, effort: EffortLevel | null]; result: void }
  'agent:setDirs': { args: [panelId: string, dirs: string[]]; result: Outcome<string[]> }
  'agent:respondPermission': { args: [panelId: string, requestId: string, decision: PermissionDecision]; result: void }
  'agent:commands': { args: [panelId: string]; result: CommandOption[] }
  'agent:models': { args: [panelId: string]; result: ModelOption[] }
  'agent:usage': { args: [panelId: string]; result: SessionUsage | null }
  'agent:btw': { args: [panelId: string, question: string]; result: SideAnswer }
  'agent:btwCancel': { args: [panelId: string]; result: void }
  'agent:contextUsage': { args: [panelId: string]; result: Outcome<ContextUsage> }
  'agent:rewindFiles': { args: [panelId: string, userMessageId: string, dryRun: boolean]; result: Outcome<RewindFiles> }
  'agent:stopTask': { args: [panelId: string, taskId: string]; result: Outcome<null> }
  'agent:background': { args: [panelId: string]; result: Outcome<boolean> }
  'agent:mcpServers': { args: [panelId: string]; result: Outcome<McpServer[]> }
  'agent:toggleMcp': { args: [panelId: string, name: string, enabled: boolean]; result: Outcome<null> }
  'agent:reconnectMcp': { args: [panelId: string, name: string]; result: Outcome<null> }
  'agent:agents': { args: [panelId: string]; result: Outcome<AgentInfo[]> }
  'agent:listSessions': { args: [projectPath: string]; result: SessionSummary[] }
  'agent:history': { args: [projectPath: string, sessionId: string]; result: AgentEvent[] }
  'agent:forkBefore': { args: [projectPath: string, sessionId: string, userMessageId: string, title?: string]; result: Outcome<{ sessionId: string | null; history: AgentEvent[] }> }
  'agent:fork': { args: [projectPath: string, sessionId: string, title?: string]; result: Outcome<string> }
  'agent:rename': { args: [projectPath: string, sessionId: string, title: string]; result: Outcome<null> }
  'agent:deleteSession': { args: [projectPath: string, sessionId: string]; result: Outcome<null> }
  'agent:close': { args: [panelId: string]; result: void }
  'dictation:start': { args: [panelId: string]; result: Outcome<null> }
  'dictation:stop': { args: [panelId: string]; result: void }
  'statusline:run': { args: [input: StatusLineInput]; result: string | null }
}

export type EventMap = {
  'pty:data': [panelId: string, chunk: string]
  'pty:exit': [panelId: string, exitCode: number]
  'agent:event': [panelId: string, event: AgentEvent]
  'agent:focus': [panelId: string]
  'fs:changed': [projectPath: string, paths: string[]]
  'git:changed': [projectPath: string]
  'dictation:event': [panelId: string, event: DictationEvent]
  /** The Janela > Transparência menu changed (percent, 0 = opaque). */
  'window:transparency': [percent: number]
}

export type InvokeChannel = keyof InvokeMap
export type InvokeArgs<K extends InvokeChannel> = InvokeMap[K]['args']
export type InvokeResult<K extends InvokeChannel> = InvokeMap[K]['result']
export type EventChannel = keyof EventMap

export type Handlers = {
  [K in InvokeChannel]: (...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>
}

export const INVOKE_CHANNELS = [
  'workspace:get',
  'workspace:save',
  'settings:get',
  'settings:save',
  'layout:get',
  'layout:save',
  'fs:pickFolder',
  'fs:pickWorkspaceFile',
  'git:info',
  'fs:list',
  'fs:read',
  'fs:index',
  'fs:write',
  'git:status',
  'git:overview',
  'git:branches',
  'git:checkout',
  'git:diff',
  'git:commit',
  'git:sync',
  'pty:create',
  'pty:write',
  'pty:resize',
  'pty:kill',
  'agent:create',
  'agent:start',
  'agent:send',
  'agent:interrupt',
  'agent:setModel',
  'agent:setMode',
  'agent:setEffort',
  'agent:setDirs',
  'agent:respondPermission',
  'agent:commands',
  'agent:models',
  'agent:usage',
  'agent:btw',
  'agent:btwCancel',
  'agent:contextUsage',
  'agent:rewindFiles',
  'agent:stopTask',
  'agent:background',
  'agent:mcpServers',
  'agent:toggleMcp',
  'agent:reconnectMcp',
  'agent:agents',
  'agent:listSessions',
  'agent:history',
  'agent:forkBefore',
  'agent:fork',
  'agent:rename',
  'agent:deleteSession',
  'agent:close',
  'dictation:start',
  'dictation:stop',
  'statusline:run',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = ['pty:data', 'pty:exit', 'agent:event', 'agent:focus', 'fs:changed', 'git:changed', 'dictation:event', 'window:transparency'] as const satisfies readonly EventChannel[]

// Compile-time guard: every channel in the maps must be listed above.
type MissingInvoke = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
type MissingEvent = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
export const CONTRACT_COMPLETE: [MissingInvoke, MissingEvent] extends [never, never] ? true : false = true

export interface NextIdeApi {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>
  on<K extends EventChannel>(channel: K, listener: (...args: EventMap[K]) => void): () => void
  /** Absolute path of a dropped/picked file; '' when it has none (e.g. a pasted screenshot). */
  pathForFile(file: File): string
}
