import type { EffortLevel, PermissionMode, SessionState } from './models'

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
export type ImageAttachment = { name: string; mediaType: ImageMediaType; data: string /* base64, no data: prefix */ }

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }

export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped'
export type TaskInfo = {
  id: string
  description: string
  status: TaskStatus
  /** Backgrounded (survives its spawning turn) vs foreground (blocks it, e.g. a normal Task-tool subagent). */
  background: boolean
  toolUseId?: string
  taskType?: string
  subagentType?: string
  /** SDK `ambient: true` (a live-update watcher, requested or auto-started): may be killed along with the query. */
  ambient?: boolean
  lastToolName?: string
  totalTokens?: number
  toolUses?: number
  durationMs?: number
  summary?: string
}

export type StatsEvent = {
  kind: 'stats'
  usage: Usage
  costUsd: number
  durationMs: number
  contextWindow?: number
  contextPct?: number
  /** Prompt size of the latest main-loop call (the context in use). */
  contextTokens?: number
}

/** A plan usage window as Claude Code's statusLine JSON shows it (resets_at: epoch seconds). */
export type RateWindow = { used_percentage: number; resets_at?: number }
export type RateLimits = { five_hour?: RateWindow; seven_day?: RateWindow }

export type PermissionDecision = 'allow' | 'allow-always' | 'deny'

/** Recovery the chat can offer next to an error ('new-session': start a fresh session in the panel). */
export type ErrorAction = 'new-session'

export type AgentEvent =
  | { kind: 'status'; state: SessionState }
  | { kind: 'query-start' }
  | { kind: 'init'; sessionId: string; model: string; cwd: string; permissionMode: PermissionMode; slashCommands: string[]; version?: string }
  | { kind: 'rate-limit'; window: 'five_hour' | 'seven_day'; usedPct: number; resetsAt?: number }
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
  | { kind: 'effort'; effort: EffortLevel | null }
  | { kind: 'dirs'; dirs: string[] }
  | { kind: 'task-started'; id: string; description: string; background: boolean; toolUseId?: string; taskType?: string; subagentType?: string; ambient?: boolean }
  | { kind: 'task-progress'; id: string; description?: string; lastToolName?: string; totalTokens: number; toolUses: number; durationMs: number }
  | { kind: 'task-done'; id: string; status: TaskStatus; summary: string }
  /** Ctrl+B moved every foreground task of the running turn to the background. */
  | { kind: 'tasks-backgrounded' }
  /** The CLI itself moved one task to the background (task_updated patch.is_backgrounded), not via Ctrl+B. */
  | { kind: 'task-backgrounded'; id: string }
  | StatsEvent
  | { kind: 'error'; message: string; action?: ErrorAction }

/** Session totals and plan usage from the SDK's experimental `usage` control request (same data as /usage). */
export type SessionUsage = {
  totalCostUsd: number
  totalDurationMs: number
  totalLinesAdded: number
  totalLinesRemoved: number
  rateLimits: RateLimits
}

/** Answer to a /btw side question: uses the session context but never enters its history. */
export type SideAnswer = { ok: true; text: string } | { ok: false; message: string }

/** Result of a panel operation that can be unsupported by the installed Claude Code or fail. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string }

/** Preview (dryRun) or result of restoring files to their state before a user message. */
export type RewindFiles = { canRewind: boolean; error?: string; filesChanged: string[]; insertions: number; deletions: number }

/** Same data as the CLI's /context. */
export type ContextUsage = {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  categories: Array<{ name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' | 'deferred' }>
  memoryFiles: Array<{ path: string; tokens: number }>
}

/** The CLI's /mcp list entry for one configured server. */
export type McpServer = { name: string; status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'; scope?: string; error?: string; version?: string }

/** The CLI's /agents list entry for one available subagent. */
export type AgentInfo = { name: string; description: string; model?: string }

export type CommandOption = { name: string; description: string; argumentHint: string }
export type ModelOption = { value: string; displayName: string; description: string }
export type SessionSummary = { sessionId: string; title: string; lastModified: number }

/** Claude Code's statusLine JSON input, as far as next-ide can provide it. */
export type StatusLineInput = {
  session_id: string
  cwd: string
  model: { id: string; display_name: string }
  workspace: { current_dir: string; project_dir: string }
  version?: string
  cost: { total_cost_usd: number; total_duration_ms: number; total_lines_added?: number; total_lines_removed?: number }
  context_window?: { context_window_size: number; used_percentage: number; total_input_tokens: number }
  exceeds_200k_tokens?: boolean
  rate_limits?: RateLimits
  effort?: { level: string }
  thinking?: { enabled: boolean }
  output_style?: { name: string }
}
