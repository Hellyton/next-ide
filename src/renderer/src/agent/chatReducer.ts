import type { AgentEvent, ErrorAction, PermissionDecision, StatsEvent } from '@shared/agent'
import type { PermissionMode, SessionState } from '@shared/models'

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
  slashCommands: string[]
  stats?: StatsEvent
  /** Displayed cost: costBaseUsd + the running total of the current query. */
  totalCostUsd: number
  /** Running total reported by the current query's last result (cumulative within a query). */
  lastQueryCostUsd: number
  /** Final totals of earlier queries of this panel (before a resume/crash/restart reset). */
  costBaseUsd: number
}

export const initialChat: ChatState = { items: [], state: 'idle', slashCommands: [], totalCostUsd: 0, lastQueryCostUsd: 0, costBaseUsd: 0 }

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
      return { ...s, state: e.state }
    case 'init':
      return { ...s, sessionId: e.sessionId, model: e.model, permissionMode: e.permissionMode, slashCommands: e.slashCommands }
    case 'mode':
      return { ...s, permissionMode: e.permissionMode }
    case 'model':
      return { ...s, model: e.model }
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
    case 'stats': {
      // total_cost_usd is cumulative per query; a drop means a new query started from zero.
      const costBaseUsd = e.costUsd < s.lastQueryCostUsd ? s.costBaseUsd + s.lastQueryCostUsd : s.costBaseUsd
      return { ...s, stats: e, costBaseUsd, lastQueryCostUsd: e.costUsd, totalCostUsd: costBaseUsd + e.costUsd }
    }
    case 'error': {
      const action = e.action ?? (isMissingConversationError(e.message) ? 'new-session' : undefined)
      return push(s, { type: 'error', id: `err-${s.items.length}`, message: e.message, ...(action ? { action } : {}) })
    }
  }
}

export function reduceAll(events: AgentEvent[], start: ChatState = initialChat): ChatState {
  return events.reduce(reduceChat, start)
}

export function pendingPermission(s: ChatState): PermissionItem | undefined {
  return s.items.find((it): it is PermissionItem => it.type === 'permission' && !it.decision)
}
