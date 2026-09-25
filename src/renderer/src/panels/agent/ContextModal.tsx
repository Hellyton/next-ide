import { useEffect, useState } from 'react'
import type { ContextUsage } from '@shared/agent'

const fmt = (n: number) => n.toLocaleString('pt-BR')
// SDK colors are theme names from the CLI; map the common ones, fall back to a neutral tone.
const COLOR: Record<string, string> = {
  gray: '#737373', grey: '#737373', purple: '#a78bfa', blue: '#60a5fa', green: '#4ade80', yellow: '#facc15',
  orange: '#fb923c', red: '#f87171', cyan: '#22d3ee', magenta: '#e879f9', pink: '#f472b6',
}
const colorOf = (c: string) => COLOR[c.toLowerCase().replace(/[^a-z]/g, '')] ?? (c.startsWith('#') ? c : '#a3a3a3')

export function ContextModal({ panelId, onClose }: { panelId: string; onClose(): void }) {
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .invoke('agent:contextUsage', panelId)
      .then((r) => (r.ok ? setUsage(r.value) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [panelId])
  const used = usage?.categories.filter((c) => c.kind !== 'free') ?? []
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Uso do contexto" className="w-[min(560px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Uso do contexto</div>
        {error && <div className="text-amber-300">{error}</div>}
        {!usage && !error && <div className="text-neutral-500">Carregando…</div>}
        {usage && (
          <>
            <div data-testid="context-total" className="mb-2 text-neutral-300">
              {fmt(usage.totalTokens)} / {fmt(usage.maxTokens)} tokens ({Math.round(usage.percentage)}%) · {usage.model}
            </div>
            <div className="mb-3 flex h-3 overflow-hidden rounded bg-neutral-800">
              {used.map((c) => (
                <div key={c.name} title={`${c.name}: ${fmt(c.tokens)}`} style={{ width: `${(c.tokens / usage.maxTokens) * 100}%`, background: colorOf(c.color) }} />
              ))}
            </div>
            <ul className="mb-3 space-y-0.5">
              {usage.categories.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(c.color) }} />
                  <span className="flex-1 text-neutral-300">{c.name}</span>
                  <span className="text-neutral-500">{fmt(c.tokens)}</span>
                </li>
              ))}
            </ul>
            {usage.memoryFiles.length > 0 && (
              <>
                <div className="mb-1 text-xs font-medium text-neutral-400">Arquivos de memória</div>
                <ul className="space-y-0.5">
                  {usage.memoryFiles.map((m) => (
                    <li key={m.path} className="flex gap-2 text-xs">
                      <span className="flex-1 truncate text-neutral-300">{m.path}</span>
                      <span className="text-neutral-500">{fmt(m.tokens)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
