import type { AgentEvent, ErrorAction, PermissionDecision, StatsEvent, TaskInfo } from '@shared/agent'
import type { EffortLevel, PermissionMode, SessionState } from '@shared/models'

export type TextItem = { type: 'text'; key: string; text: string; final: boolean; parentToolUseId?: string }
export type ToolItem = { type: 'tool'; id: string; name: string; input: unknown; output?: string; isError?: boolean; parentToolUseId?: string }
export type PermissionItem = {
  type: 'permission'
  requestId: string
  toolName: string
  input: unknown
  title?: string
  canAlwaysAllow: boolean
  decision?: PermissionDecision | 'cancelled'
}
export type ChatItem =
  | { type: 'user'; id: string; text: string; images: number }
  | TextItem
  | { type: 'thinking'; key: string; text: string }
  | ToolItem
  | PermissionItem
  | { type: 'error'; id: string; message: string; action?: ErrorAction }

export type ChatState = {
  items: ChatItem[]
  state: SessionState
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
  effort?: EffortLevel | null
  slashCommands: string[]
  /** Claude Code version reported by the session's init. */
  version?: string
  stats?: StatsEvent
  /** Displayed cost: costBaseUsd + the running total of the current query. */
  totalCostUsd: number
  /** Running total reported by the current query's last result (cumulative within a query). */
  lastQueryCostUsd: number
  /** Final totals of earlier queries of this panel (before a resume/crash/restart reset). */
  costBaseUsd: number
  /** Background tasks tracked during this session. */
  tasks: TaskInfo[]
}

export const initialChat: ChatState = { items: [], state: 'idle', slashCommands: [], totalCostUsd: 0, lastQueryCostUsd: 0, costBaseUsd: 0, tasks: [] }

const push = (s: ChatState, item: ChatItem): ChatState => ({ ...s, items: [...s.items, item] })
const replaceAt = (s: ChatState, index: number, item: ChatItem): ChatState => {
  const items = [...s.items]
  items[index] = item
  return { ...s, items }
}
/**
 * Claude Code's wording when `--resume` points at a transcript that is gone
 * ("No conversation found with session ID: …" / "No conversation found to continue").
 */
export const isMissingConversationError = (message: string): boolean => /no conversation found/i.test(message)

/** Searches from the end: updates almost always target the newest items of a long chat. */
const lastIndexWhere = (s: ChatState, match: (item: ChatItem) => boolean): number => {
  for (let i = s.items.length - 1; i >= 0; i--) if (match(s.items[i]!)) return i
  return -1
}

export function reduceChat(s: ChatState, e: AgentEvent): ChatState {
  switch (e.kind) {
    case 'status':
      return { ...s, state: e.state, ...(e.state === 'exited' || e.state === 'error' ? { tasks: [] } : {}) }
    case 'query-start':
      // A new query (resume, /clear, or a crash-restart) starts its running total from zero;
      // fold whatever the previous query last reported into the base so it isn't lost.
      return { ...s, costBaseUsd: s.costBaseUsd + s.lastQueryCostUsd, lastQueryCostUsd: 0, tasks: [] }
    case 'init':
      return {
        ...s,
        sessionId: e.sessionId,
        model: e.model,
        permissionMode: e.permissionMode,
        slashCommands: e.slashCommands,
        ...(e.version ? { version: e.version } : {}),
      }
    case 'mode':
      return { ...s, permissionMode: e.permissionMode }
    case 'model':
      return { ...s, model: e.model }
    case 'effort':
      return { ...s, effort: e.effort }
    case 'user':
      return push(s, { type: 'user', id: e.id, text: e.text, images: e.images })
    case 'text-delta': {
      const i = lastIndexWhere(s, (it) => it.type === 'text' && it.key === e.key)
      if (i < 0) {
        return push(s, { type: 'text', key: e.key, text: e.text, final: false, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) })
      }
      const item = s.items[i] as TextItem
      return item.final ? s : replaceAt(s, i, { ...item, text: item.text + e.text })
    }
    case 'text': {
      const item: TextItem = { type: 'text', key: e.key, text: e.text, final: true, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      const i = lastIndexWhere(s, (it) => it.type === 'text' && it.key === e.key)
      return i < 0 ? push(s, item) : replaceAt(s, i, item)
    }
    case 'thinking':
      return lastIndexWhere(s, (it) => it.type === 'thinking' && it.key === e.key) >= 0 ? s : push(s, { type: 'thinking', key: e.key, text: e.text })
    case 'tool-start': {
      const i = lastIndexWhere(s, (it) => it.type === 'tool' && it.id === e.id)
      const base: ToolItem = { type: 'tool', id: e.id, name: e.name, input: e.input, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      return i < 0 ? push(s, base) : replaceAt(s, i, { ...(s.items[i] as ToolItem), input: e.input })
    }
    case 'tool-result': {
      const i = lastIndexWhere(s, (it) => it.type === 'tool' && it.id === e.id)
      return i < 0 ? s : replaceAt(s, i, { ...(s.items[i] as ToolItem), output: e.output, isError: e.isError })
    }
    case 'permission-request':
      return push(s, {
        type: 'permission',
        requestId: e.requestId,
        toolName: e.toolName,
        input: e.input,
        canAlwaysAllow: e.canAlwaysAllow,
        ...(e.title ? { title: e.title } : {}),
      })
    case 'permission-resolved': {
      const i = lastIndexWhere(s, (it) => it.type === 'permission' && it.requestId === e.requestId)
      return i < 0 ? s : replaceAt(s, i, { ...(s.items[i] as PermissionItem), decision: e.decision })
    }
    case 'stats':
      // total_cost_usd is cumulative per query; `query-start` is what rolls the base forward.
      return { ...s, stats: e, lastQueryCostUsd: e.costUsd, totalCostUsd: s.costBaseUsd + e.costUsd }
    case 'rate-limit':
      // Account-wide, not per chat: kept in the agents store (see handleAgentEvent).
      return s
    case 'error': {
      const action = e.action ?? (isMissingConversationError(e.message) ? 'new-session' : undefined)
      return push(s, { type: 'error', id: `err-${s.items.length}`, message: e.message, ...(action ? { action } : {}) })
    }
    case 'task-started':
      return {
        ...s,
        tasks: [...s.tasks.filter((t) => t.id !== e.id), { id: e.id, description: e.description, status: 'running', ...(e.toolUseId ? { toolUseId: e.toolUseId } : {}), ...(e.taskType ? { taskType: e.taskType } : {}), ...(e.subagentType ? { subagentType: e.subagentType } : {}) }],
      }
    case 'task-progress': {
      if (!s.tasks.some((t) => t.id === e.id)) return s
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === e.id
            ? { ...t, ...(e.description ? { description: e.description } : {}), ...(e.lastToolName ? { lastToolName: e.lastToolName } : {}), totalTokens: e.totalTokens, toolUses: e.toolUses, durationMs: e.durationMs }
            : t,
        ),
      }
    }
    case 'task-done':
      if (!s.tasks.some((t) => t.id === e.id)) return s
      return { ...s, tasks: s.tasks.map((t) => (t.id === e.id ? { ...t, status: e.status, summary: e.summary } : t)) }
  }
}

export function reduceAll(events: AgentEvent[], start: ChatState = initialChat): ChatState {
  return events.reduce(reduceChat, start)
}

export function pendingPermission(s: ChatState): PermissionItem | undefined {
  return s.items.find((it): it is PermissionItem => it.type === 'permission' && !it.decision)
}
