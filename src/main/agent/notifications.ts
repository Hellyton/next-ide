import { basename } from 'node:path'
import type { AgentEvent } from '@shared/agent'
import type { SessionState } from '@shared/models'

export type NotificationReason = 'done' | 'permission' | 'error'

const WORKING: ReadonlySet<SessionState | undefined> = new Set(['running', 'awaiting_permission'])

/** What to tell the user about a panel's state change; null for synthetic/boring transitions. */
export function notificationFor(prev: SessionState | undefined, next: SessionState): { reason: NotificationReason } | null {
  if (prev === next) return null
  if (next === 'awaiting_permission') return { reason: 'permission' }
  if (next === 'error') return WORKING.has(prev) ? { reason: 'error' } : null
  if (next === 'idle') return WORKING.has(prev) ? { reason: 'done' } : null
  return null
}

const BODY: Record<NotificationReason, string> = { done: 'Terminou', permission: 'Pedindo permissão', error: 'Erro na sessão' }

export type NotifierDeps = {
  isFocused(): boolean
  enabled(): boolean
  projectOf(panelId: string): string | undefined
  show(n: { title: string; body: string; panelId: string }): void
}

/** Turns agent status events into OS notifications while the window is in the background. */
export class AgentNotifier {
  private readonly states = new Map<string, SessionState>()

  constructor(private readonly deps: NotifierDeps) {}

  onEvent(panelId: string, event: AgentEvent): void {
    if (event.kind !== 'status') return
    const prev = this.states.get(panelId)
    this.states.set(panelId, event.state)
    const n = notificationFor(prev, event.state)
    if (!n || this.deps.isFocused() || !this.deps.enabled()) return
    const project = this.deps.projectOf(panelId)
    this.deps.show({ title: project ? `${basename(project)} · Claude` : 'Claude', body: BODY[n.reason], panelId })
  }

  forget(panelId: string): void {
    this.states.delete(panelId)
  }
}
