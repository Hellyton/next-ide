import type { AgentEvent } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { AgentSession, type QueryFn } from './AgentSession'

export type AgentRuntime = { queryFn: QueryFn; claudePath?: string; env?: Record<string, string> }

export class AgentManager {
  private readonly sessions = new Map<string, AgentSession>()

  constructor(private readonly deps: { emit(panelId: string, event: AgentEvent): void; runtime(): AgentRuntime }) {}

  create(panelId: string, params: AgentPanelParams): void {
    if (this.sessions.has(panelId)) return
    const runtime = this.deps.runtime()
    const permissionMode = params.permissionMode ?? 'default'
    this.sessions.set(
      panelId,
      new AgentSession(
        {
          cwd: params.projectPath,
          permissionMode,
          ...(params.model ? { model: params.model } : {}),
          ...(params.effort ? { effort: params.effort } : {}),
          ...(params.sessionId ? { resume: params.sessionId } : {}),
        },
        {
          queryFn: runtime.queryFn,
          emit: (event) => this.deps.emit(panelId, event),
          ...(runtime.claudePath ? { claudePath: runtime.claudePath } : {}),
          ...(runtime.env ? { env: runtime.env } : {}),
        },
      ),
    )
    // The real CLI only reports the mode in its first `init` (i.e. after the first message), so
    // tell the panel now — otherwise a fresh panel would show the wrong mode until it is used.
    this.deps.emit(panelId, { kind: 'mode', permissionMode })
    this.deps.emit(panelId, { kind: 'effort', effort: params.effort ?? null })
  }

  get(panelId: string): AgentSession {
    const session = this.sessions.get(panelId)
    if (!session) throw new Error(`Sessão de agente não encontrada: ${panelId}`)
    return session
  }

  close(panelId: string): void {
    this.sessions.get(panelId)?.close()
    this.sessions.delete(panelId)
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }

  hasBusy(): boolean {
    return [...this.sessions.values()].some((s) => s.currentState === 'running' || s.currentState === 'awaiting_permission')
  }
}
