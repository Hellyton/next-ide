import type { AgentEvent, Outcome, RewindFiles } from '@shared/agent'
import type { ChatItem } from './chatReducer'

export type RewindMode = 'both' | 'conversation' | 'code'
export type RewindTarget = { id: string; text: string }
export type RewindDeps = {
  rewindFiles(id: string): Promise<Outcome<RewindFiles>>
  forkBefore(id: string): Promise<Outcome<{ sessionId: string | null; history: AgentEvent[] }>>
  restart(sessionId: string | null, history: AgentEvent[]): Promise<void>
  setDraft(text: string): void
}

export function rewindTargets(items: ChatItem[]): RewindTarget[] {
  const out: RewindTarget[] = []
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type === 'user' && it.id) out.push({ id: it.id, text: it.text })
  }
  return out
}

/**
 * The CLI's /rewind. Order matters: the fork only writes a new transcript (non-destructive), so it
 * goes first; restoring files needs the live session's checkpoints, so it runs before the restart.
 * A failed fork therefore changes nothing on disk.
 */
export async function runRewind(mode: RewindMode, target: RewindTarget, deps: RewindDeps): Promise<void> {
  const forked = mode === 'code' ? null : await deps.forkBefore(target.id)
  if (forked && !forked.ok) throw new Error(forked.message)
  if (mode !== 'conversation') {
    const files = await deps.rewindFiles(target.id)
    if (!files.ok) throw new Error(files.message)
    if (!files.value.canRewind) throw new Error(files.value.error ?? 'Não há checkpoint de arquivos para esta mensagem.')
  }
  if (!forked) return
  await deps.restart(forked.value.sessionId, forked.value.history)
  deps.setDraft(target.text)
}
