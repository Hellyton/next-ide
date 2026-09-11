import { create } from 'zustand'
import type { AgentEvent } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { initialChat, reduceAll, reduceChat, type ChatState } from '../agent/chatReducer'
import { useDock } from '../dock/dockStore'
import { replacementPatch } from '../dock/panelParams'
import { useSessions } from './sessionsStore'

type AgentsState = {
  chats: Record<string, ChatState>
  apply(panelId: string, event: AgentEvent): void
  load(panelId: string, events: AgentEvent[]): void
  clear(panelId: string): void
  remove(panelId: string): void
  setChat(panelId: string, chat: ChatState | undefined): void
}

export const useAgents = create<AgentsState>()((set) => ({
  chats: {},
  apply: (panelId, event) => set((s) => ({ chats: { ...s.chats, [panelId]: reduceChat(s.chats[panelId] ?? initialChat, event) } })),
  load: (panelId, events) => set((s) => ({ chats: { ...s.chats, [panelId]: reduceAll(events, s.chats[panelId] ?? initialChat) } })),
  clear: (panelId) => set((s) => ({ chats: { ...s.chats, [panelId]: initialChat } })),
  remove: (panelId) =>
    set((s) => {
      pendingSessionId.delete(panelId)
      const { [panelId]: _removed, ...rest } = s.chats
      return { chats: rest }
    }),
  setChat: (panelId, chat) =>
    set((s) => {
      if (chat === undefined) {
        const { [panelId]: _removed, ...rest } = s.chats
        return { chats: rest }
      }
      return { chats: { ...s.chats, [panelId]: chat } }
    }),
}))

export const selectChat =
  (panelId: string) =>
  (s: AgentsState): ChatState =>
    s.chats[panelId] ?? initialChat

/** Keeps session id / model / mode in the panel params so the layout restores them. */
function persistParams(panelId: string, patch: Partial<AgentPanelParams>): void {
  const panel = useDock.getState().api?.getPanel(panelId)
  const params = panel?.params as AgentPanelParams | undefined
  if (!panel || params?.type !== 'agent') return
  panel.api.updateParameters({ ...params, ...patch })
}

export function currentAgentParams(panelId: string): AgentPanelParams | undefined {
  const params = useDock.getState().api?.getPanel(panelId)?.params as AgentPanelParams | undefined
  return params?.type === 'agent' ? params : undefined
}

export function replacePanelParams(panelId: string, params: AgentPanelParams): void {
  const panel = useDock.getState().api?.getPanel(panelId)
  if (!panel) return
  panel.api.updateParameters(replacementPatch(panel.params, params))
}

/**
 * `init` fires right after `agent:start`, before any user message: a panel opened but never
 * used would otherwise persist a `sessionId` with no transcript, and show the "Sessão anterior
 * não encontrada." card on every relaunch. Holds one sessionId per panel until its first `user`.
 */
const pendingSessionId = new Map<string, string>()

export function handleAgentEvent(panelId: string, event: AgentEvent): void {
  // Late events (e.g. the `exited` from agent:close) can arrive after the panel left the dock;
  // applying them would resurrect a chat entry for a panel that no longer exists.
  if (!useSessions.getState().byId[panelId]) return
  useAgents.getState().apply(panelId, event)
  if (event.kind === 'status') useSessions.getState().setState(panelId, event.state)
  if (event.kind === 'init' && event.sessionId) {
    const hasUserItem = useAgents.getState().chats[panelId]?.items.some((it) => it.type === 'user') ?? false
    if (hasUserItem) persistParams(panelId, { sessionId: event.sessionId })
    else pendingSessionId.set(panelId, event.sessionId)
  }
  if (event.kind === 'user') {
    const sessionId = pendingSessionId.get(panelId)
    if (sessionId) {
      pendingSessionId.delete(panelId)
      persistParams(panelId, { sessionId })
    }
  }
  if (event.kind === 'model') persistParams(panelId, { model: event.model })
  if (event.kind === 'mode') persistParams(panelId, { permissionMode: event.permissionMode })
}

let subscribed = false
export function subscribeAgentEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('agent:event', handleAgentEvent)
}
