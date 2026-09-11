import type { AgentEvent, PermissionDecision, StatsEvent } from '@shared/agent'
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
  | { type: 'error'; id: string; message: string }

export type ChatState = {
  items: ChatItem[]
  state: SessionState
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
  slashCommands: string[]
  stats?: StatsEvent
  totalCostUsd: number
}

export const initialChat: ChatState = { items: [], state: 'idle', slashCommands: [], totalCostUsd: 0 }

const push = (s: ChatState, item: ChatItem): ChatState => ({ ...s, items: [...s.items, item] })
const replaceAt = (s: ChatState, index: number, item: ChatItem): ChatState => {
  const items = [...s.items]
  items[index] = item
  return { ...s, items }
}
const indexOf = (s: ChatState, match: (item: ChatItem) => boolean): number => s.items.findIndex(match)

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
      const i = indexOf(s, (it) => it.type === 'text' && it.key === e.key)
      if (i < 0) {
        return push(s, { type: 'text', key: e.key, text: e.text, final: false, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) })
      }
      const item = s.items[i] as TextItem
      return item.final ? s : replaceAt(s, i, { ...item, text: item.text + e.text })
    }
    case 'text': {
      const item: TextItem = { type: 'text', key: e.key, text: e.text, final: true, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      const i = indexOf(s, (it) => it.type === 'text' && it.key === e.key)
      return i < 0 ? push(s, item) : replaceAt(s, i, item)
    }
    case 'thinking':
      return indexOf(s, (it) => it.type === 'thinking' && it.key === e.key) >= 0 ? s : push(s, { type: 'thinking', key: e.key, text: e.text })
    case 'tool-start': {
      const i = indexOf(s, (it) => it.type === 'tool' && it.id === e.id)
      const base: ToolItem = { type: 'tool', id: e.id, name: e.name, input: e.input, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      return i < 0 ? push(s, base) : replaceAt(s, i, { ...(s.items[i] as ToolItem), input: e.input })
    }
    case 'tool-result': {
      const i = indexOf(s, (it) => it.type === 'tool' && it.id === e.id)
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
      const i = indexOf(s, (it) => it.type === 'permission' && it.requestId === e.requestId)
      return i < 0 ? s : replaceAt(s, i, { ...(s.items[i] as PermissionItem), decision: e.decision })
    }
    case 'stats':
      return { ...s, stats: e, totalCostUsd: s.totalCostUsd + e.costUsd }
    case 'error':
      return push(s, { type: 'error', id: `err-${s.items.length}`, message: e.message })
  }
}

export function reduceAll(events: AgentEvent[], start: ChatState = initialChat): ChatState {
  return events.reduce(reduceChat, start)
}

export function pendingPermission(s: ChatState): PermissionItem | undefined {
  return s.items.find((it): it is PermissionItem => it.type === 'permission' && !it.decision)
}
