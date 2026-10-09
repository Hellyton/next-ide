import { useEffect, useState } from 'react'
import { isBranchName, type GitBranches, type GitCheckout } from '@shared/git'

type Props = { projectPath: string; onClose(): void; onSwitched?(): void; className?: string }

/** Lists the project's branches; picking one switches to it, typing a new name offers to create it. */
export function BranchPicker({ projectPath, onClose, onSwitched, className = '' }: Props) {
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.invoke('git:branches', projectPath).then((b) => {
      if (alive) setBranches(b)
    })
    return () => {
      alive = false
    }
  }, [projectPath])

  const query = filter.trim()
  const match = (name: string) => name.toLowerCase().includes(query.toLowerCase())
  const local = branches?.local.filter(match) ?? []
  const remote = branches?.remote.filter(match) ?? []
  const canCreate = isBranchName(query) && !branches?.local.includes(query)

  const go = (target: GitCheckout) => {
    if (busy) return
    setBusy(true)
    setError(null)
    void window.api
      .invoke('git:checkout', projectPath, target)
      .then((r) => {
        if (!r.ok) return setError(r.message)
        onSwitched?.()
        onClose()
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  const row = 'block w-full truncate rounded px-2 py-1 text-left hover:bg-neutral-800 disabled:opacity-50'

  return (
    <div
      role="dialog"
      aria-label="Trocar de branch"
      data-testid="branch-picker"
      className={`z-20 w-72 rounded border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300 shadow-lg ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'Enter' && canCreate && local.length === 0 && remote.length === 0) go({ kind: 'create', name: query })
      }}
    >
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar ou criar branch"
        className="mb-1 w-full rounded bg-neutral-950 px-2 py-1 outline-none ring-1 ring-neutral-700 focus:ring-neutral-500"
      />
      {error && <div className="mb-1 rounded bg-red-950/60 px-2 py-1 whitespace-pre-wrap text-red-300">{error}</div>}
      <div className="max-h-64 overflow-auto">
        {!branches && <div className="px-2 py-1 text-neutral-500">Carregando…</div>}
        {local.map((name) => (
          <button key={name} disabled={busy || name === branches?.current} className={row} onClick={() => go({ kind: 'existing', name })}>
            <span className="inline-block w-4 text-orange-400">{name === branches?.current ? '✓' : ''}</span>
            {name}
          </button>
        ))}
        {remote.length > 0 && <div className="mt-1 px-2 py-0.5 text-[10px] tracking-wide text-neutral-500 uppercase">Remotas</div>}
        {remote.map((name) => (
          <button key={name} disabled={busy} className={row} onClick={() => go({ kind: 'existing', name })}>
            <span className="inline-block w-4" />
            {name}
          </button>
        ))}
        {canCreate && (
          <button disabled={busy} className={`${row} mt-1 text-orange-300`} onClick={() => go({ kind: 'create', name: query })}>
            + Criar branch “{query}”
          </button>
        )}
        {branches && local.length === 0 && remote.length === 0 && !canCreate && <div className="px-2 py-1 text-neutral-500">Nenhuma branch.</div>}
      </div>
    </div>
  )
}
