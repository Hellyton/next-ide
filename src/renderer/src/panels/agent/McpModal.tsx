import { useCallback, useEffect, useState } from 'react'
import type { McpServer } from '@shared/agent'
import { useDock } from '../../dock/dockStore'
import { useDialogKeys } from './useDialogKeys'

const LABEL: Record<McpServer['status'], string> = {
  connected: 'conectado',
  failed: 'falhou',
  'needs-auth': 'precisa de login',
  pending: 'conectando…',
  disabled: 'desligado',
}
const COLOR: Record<McpServer['status'], string> = {
  connected: 'text-emerald-400',
  failed: 'text-red-400',
  'needs-auth': 'text-amber-300',
  pending: 'text-neutral-400',
  disabled: 'text-neutral-500',
}

export function McpModal({ panelId, projectPath, onClose }: { panelId: string; projectPath: string; onClose(): void }) {
  const dialog = useDialogKeys(onClose)
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    window.api
      .invoke('agent:mcpServers', panelId)
      .then((r) => (r.ok ? (setServers(r.value), setError(null)) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [panelId])
  useEffect(load, [load])
  // The modal never refreshed on its own: while a server is still connecting, poll so a
  // reconnect's outcome (success or the inline auth error) shows up without user action.
  useEffect(() => {
    if (!servers?.some((s) => s.status === 'pending')) return
    const id = setInterval(load, 1500)
    return () => clearInterval(id)
  }, [servers, load])
  const act = (name: string, run: () => Promise<{ ok: true; value: null } | { ok: false; message: string }>) => {
    setBusy(name)
    void run()
      .then((r) => (r.ok ? load() : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(null))
  }
  const openTerminal = () => {
    useDock.getState().open({ type: 'terminal', projectPath, initialCommand: 'claude /mcp' })
    onClose()
  }
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Servidores MCP" {...dialog} className="w-[min(560px,90%)] rounded border outline-none border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Servidores MCP</span>
          <button className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700" onClick={load}>
            Recarregar
          </button>
        </div>
        {error && <div className="mb-2 text-amber-300">{error}</div>}
        {!servers && !error && <div className="text-neutral-500">Carregando…</div>}
        {servers?.length === 0 && <div className="text-neutral-500">Nenhum servidor MCP configurado.</div>}
        <ul className="space-y-1">
          {servers?.map((s) => (
            <li key={s.name} data-testid="mcp-row" className="flex items-center gap-2 rounded px-2 py-1 hover:bg-neutral-800/60">
              <span className="min-w-0 flex-1">
                <span className="text-neutral-100">{s.name}</span>
                {s.version && <span className="ml-1 text-xs text-neutral-500">v{s.version}</span>}
                {s.scope && <span className="ml-1 text-xs text-neutral-500">· {s.scope}</span>}
                {s.error && <span className="block truncate text-xs text-neutral-500">{s.error}</span>}
              </span>
              <span className={`text-xs ${COLOR[s.status]}`}>{LABEL[s.status]}</span>
              <button
                aria-label={`${s.status === 'disabled' ? 'Ligar' : 'Desligar'} ${s.name}`}
                disabled={busy !== null}
                className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
                onClick={() => act(s.name, () => window.api.invoke('agent:toggleMcp', panelId, s.name, s.status === 'disabled'))}
              >
                {s.status === 'disabled' ? 'Ligar' : 'Desligar'}
              </button>
              {s.status !== 'disabled' && (
                <button
                  aria-label={`Reconectar ${s.name}`}
                  disabled={busy !== null}
                  className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
                  onClick={() => act(s.name, () => window.api.invoke('agent:reconnectMcp', panelId, s.name))}
                >
                  ↻
                </button>
              )}
              {s.status === 'needs-auth' && (
                <button className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700" onClick={openTerminal}>
                  Abrir em terminal
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
