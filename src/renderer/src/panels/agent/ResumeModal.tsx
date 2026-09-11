import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/agent'

const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function ResumeModal({ projectPath, onPick, onClose }: { projectPath: string; onPick(sessionId: string): void; onClose(): void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .invoke('agent:listSessions', projectPath)
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectPath])
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Retomar sessão" className="w-[min(520px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Retomar sessão</div>
        {error && <div className="text-red-400">{error}</div>}
        {!sessions && !error && <div className="text-neutral-500">Carregando…</div>}
        {sessions?.length === 0 && <div className="text-neutral-500">Nenhuma sessão anterior neste projeto.</div>}
        <div className="max-h-80 space-y-1 overflow-auto">
          {sessions?.map((s) => (
            <button key={s.sessionId} className="block w-full rounded px-2 py-1 text-left hover:bg-neutral-800" onClick={() => onPick(s.sessionId)}>
              <div className="truncate text-neutral-100">{s.title}</div>
              <div className="text-xs text-neutral-500">{when(s.lastModified)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
