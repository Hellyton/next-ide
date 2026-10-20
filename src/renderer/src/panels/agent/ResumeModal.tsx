import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/agent'
import type { PanelParams } from '@shared/models'
import { useDock } from '../../dock/dockStore'
import { useAgents } from '../../stores/agentStore'
import { useDialogKeys } from './useDialogKeys'

const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Sessions some panel still has open (live or waiting to resume): deleting them would pull the transcript from under it. */
function openSessionIds(): Set<string> {
  const ids = new Set<string>()
  for (const chat of Object.values(useAgents.getState().chats)) if (chat.sessionId) ids.add(chat.sessionId)
  for (const panel of useDock.getState().api?.panels ?? []) {
    const params = panel.params as PanelParams | undefined
    if (params?.type === 'agent' && params.sessionId) ids.add(params.sessionId)
  }
  return ids
}

export function ResumeModal({ projectPath, onPick, onClose }: { projectPath: string; onPick(sessionId: string): void; onClose(): void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open] = useState(openSessionIds)
  useEffect(() => {
    window.api
      .invoke('agent:listSessions', projectPath)
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectPath])
  const dialog = useDialogKeys(onClose)
  const remove = (s: SessionSummary) => {
    if (!window.confirm(`Apagar a conversa "${s.title}"?\n\nO histórico é removido do disco (também some do /resume do Claude Code) e não dá para desfazer.`)) return
    setError(null)
    void window.api
      .invoke('agent:deleteSession', projectPath, s.sessionId)
      .then((r) => (r.ok ? setSessions((list) => list?.filter((x) => x.sessionId !== s.sessionId) ?? null) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Retomar sessão" {...dialog} className="w-[min(520px,90%)] rounded border outline-none border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Retomar sessão</div>
        {error && <div className="text-red-400">{error}</div>}
        {!sessions && !error && <div className="text-neutral-500">Carregando…</div>}
        {sessions?.length === 0 && <div className="text-neutral-500">Nenhuma sessão anterior neste projeto.</div>}
        <div className="max-h-80 space-y-1 overflow-auto">
          {sessions?.map((s) => {
            const busy = open.has(s.sessionId)
            return (
              <div key={s.sessionId} data-testid="resume-row" className="group flex items-center gap-1 rounded hover:bg-neutral-800">
                <button className="min-w-0 flex-1 px-2 py-1 text-left" onClick={() => onPick(s.sessionId)}>
                  <div className="truncate text-neutral-100">{s.title}</div>
                  <div className="text-xs text-neutral-500">{when(s.lastModified)}</div>
                </button>
                <button
                  aria-label="Apagar conversa"
                  title={busy ? 'Aberta em um painel: feche-o para apagar' : 'Apagar conversa'}
                  disabled={busy}
                  className="mr-1 shrink-0 rounded px-2 py-1 text-neutral-500 opacity-0 group-hover:opacity-100 hover:bg-neutral-700 hover:text-red-400 focus:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-500"
                  onClick={() => remove(s)}
                >
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
