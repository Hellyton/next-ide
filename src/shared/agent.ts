import type { PermissionMode, SessionState } from './models'

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
export type ImageAttachment = { name: string; mediaType: ImageMediaType; data: string /* base64, no data: prefix */ }

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }

export type StatsEvent = {
  kind: 'stats'
  usage: Usage
  costUsd: number
  durationMs: number
  contextWindow?: number
  contextPct?: number
}

export type PermissionDecision = 'allow' | 'allow-always' | 'deny'

/** Recovery the chat can offer next to an error ('new-session': start a fresh session in the panel). */
export type ErrorAction = 'new-session'

export type AgentEvent =
  | { kind: 'status'; state: SessionState }
  | { kind: 'init'; sessionId: string; model: string; cwd: string; permissionMode: PermissionMode; slashCommands: string[] }
  | { kind: 'user'; id: string; text: string; images: number }
  | { kind: 'text-delta'; key: string; text: string; parentToolUseId?: string }
  | { kind: 'text'; key: string; text: string; parentToolUseId?: string }
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'tool-start'; id: string; name: string; input: unknown; parentToolUseId?: string }
  | { kind: 'tool-result'; id: string; output: string; isError: boolean }
  | { kind: 'permission-request'; requestId: string; toolName: string; input: unknown; title?: string; canAlwaysAllow: boolean }
  | { kind: 'permission-resolved'; requestId: string; decision: PermissionDecision | 'cancelled' }
  | { kind: 'mode'; permissionMode: PermissionMode }
  | { kind: 'model'; model: string }
  | StatsEvent
  | { kind: 'error'; message: string; action?: ErrorAction }

export type CommandOption = { name: string; description: string; argumentHint: string }
export type ModelOption = { value: string; displayName: string; description: string }
export type SessionSummary = { sessionId: string; title: string; lastModified: number }

/** Subset of Claude Code's statusLine JSON input that next-ide can provide. */
export type StatusLineInput = {
  session_id: string
  cwd: string
  model: { id: string; display_name: string }
  workspace: { current_dir: string; project_dir: string }
  cost: { total_cost_usd: number; total_duration_ms: number }
  context_window?: { context_window_size: number; used_percentage: number; total_input_tokens: number }
}
