import { useEffect, useState } from 'react'
import type { AgentInfo } from '@shared/agent'
import { useDock } from '../../dock/dockStore'
import { useDialogKeys } from './useDialogKeys'

export function AgentsModal({ panelId, projectPath, onClose }: { panelId: string; projectPath: string; onClose(): void }) {
  const dialog = useDialogKeys(onClose)
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .invoke('agent:agents', panelId)
      .then((r) => (r.ok ? setAgents(r.value) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [panelId])
  const openTerminal = () => {
    useDock.getState().open({ type: 'terminal', projectPath, initialCommand: 'claude /agents' })
    onClose()
  }
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Subagentes" {...dialog} className="w-[min(560px,90%)] rounded border outline-none border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Subagentes</div>
        {error && <div className="mb-2 text-amber-300">{error}</div>}
        {!agents && !error && <div className="text-neutral-500">Carregando…</div>}
        {agents?.length === 0 && <div className="text-neutral-500">Nenhum subagente disponível.</div>}
        <ul className="mb-3 space-y-1">
          {agents?.map((a) => (
            <li key={a.name} className="rounded px-2 py-1 hover:bg-neutral-800/60">
              <div>
                <span className="font-medium text-neutral-100">{a.name}</span>
                {a.model && <span className="ml-2 text-xs text-neutral-500">{a.model}</span>}
              </div>
              {a.description && <div className="text-xs text-neutral-400">{a.description}</div>}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700" onClick={openTerminal}>
            Gerenciar no terminal
          </button>
        </div>
      </div>
    </div>
  )
}
