import type { GitInfo, LayoutState, Settings, Workspace } from './models'

export type InvokeMap = {
  'workspace:get': { args: []; result: Workspace[] }
  'workspace:save': { args: [workspaces: Workspace[]]; result: void }
  'settings:get': { args: []; result: Settings }
  'settings:save': { args: [settings: Settings]; result: void }
  'layout:get': { args: []; result: LayoutState | null }
  'layout:save': { args: [layout: LayoutState]; result: void }
  'fs:pickFolder': { args: []; result: string | null }
  'fs:pickWorkspaceFile': { args: []; result: { name: string; paths: string[] } | null }
  'git:info': { args: [projectPath: string]; result: GitInfo }
  'pty:create': { args: [panelId: string, cwd: string, cols: number, rows: number]; result: void }
  'pty:write': { args: [panelId: string, data: string]; result: void }
  'pty:resize': { args: [panelId: string, cols: number, rows: number]; result: void }
  'pty:kill': { args: [panelId: string]; result: void }
}

export type EventMap = {
  'pty:data': [panelId: string, chunk: string]
  'pty:exit': [panelId: string, exitCode: number]
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
  'pty:create',
  'pty:write',
  'pty:resize',
  'pty:kill',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = ['pty:data', 'pty:exit'] as const satisfies readonly EventChannel[]

// Compile-time guard: every channel in the maps must be listed above.
type MissingInvoke = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
type MissingEvent = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
export const CONTRACT_COMPLETE: [MissingInvoke, MissingEvent] extends [never, never] ? true : false = true

export interface NextIdeApi {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>
  on<K extends EventChannel>(channel: K, listener: (...args: EventMap[K]) => void): () => void
}
