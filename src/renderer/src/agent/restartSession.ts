import type { AgentEvent } from '@shared/agent'
import type { AgentPanelParams, SessionState } from '@shared/models'
import type { ChatState } from './chatReducer'

export type RestartSessionDeps = {
  invoke: typeof window.api.invoke
  getChat(panelId: string): ChatState | undefined
  setChat(panelId: string, chat: ChatState | undefined): void
  clearChat(panelId: string): void
  loadChat(panelId: string, events: AgentEvent[]): void
  currentParams(panelId: string): AgentPanelParams | undefined
  replaceParams(panelId: string, params: AgentPanelParams): void
  apply(panelId: string, event: AgentEvent): void
  /** Mirrors the panel's state into the sessions list (close() reported `exited`). */
  setSessionState(panelId: string, state: SessionState): void
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Switches a panel to a different agent session (resume/clear), tearing down the
 * current one and standing up `next`. If anything in that sequence fails, the
 * previous chat and params are restored and the previous session is re-created
 * (but not started) so it can resume lazily on the next send. Resolves true when `next` is live.
 */
export async function restartSession(panelId: string, next: AgentPanelParams, history: AgentEvent[], deps: RestartSessionDeps): Promise<boolean> {
  const prevChat = deps.getChat(panelId)
  const prevParams = deps.currentParams(panelId)
  try {
    await deps.invoke('agent:close', panelId)
    deps.clearChat(panelId)
    if (history.length > 0) deps.loadChat(panelId, history)
    deps.replaceParams(panelId, next)
    await deps.invoke('agent:create', panelId, next)
    if (!next.sessionId) await deps.invoke('agent:start', panelId)
    deps.setSessionState(panelId, 'idle')
    return true
  } catch (err) {
    // The old query died with `agent:close`; any tasks it was tracking can no longer be stopped.
    deps.setChat(panelId, prevChat ? { ...prevChat, tasks: [] } : prevChat)
    if (prevParams) deps.replaceParams(panelId, prevParams)
    deps.apply(panelId, { kind: 'error', message: `Não foi possível trocar de sessão: ${errorText(err)}` })
    if (prevParams) {
      try {
        await deps.invoke('agent:create', panelId, prevParams)
        deps.setSessionState(panelId, 'idle')
      } catch (err2) {
        deps.apply(panelId, { kind: 'error', message: `Não foi possível trocar de sessão: ${errorText(err2)}` })
      }
    }
    return false
  }
}
