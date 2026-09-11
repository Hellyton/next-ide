import { useEffect, useMemo, useState } from 'react'
import { fuzzyFilter } from '@shared/fuzzy'
import { uniqueProjects } from '@shared/workspaces'
import { useDock } from '../dock/dockStore'
import { useFiles } from '../stores/filesStore'
import { useWorkspaces } from '../stores/workspaceStore'
import { useQuickOpen } from './quickOpenStore'

type Hit = { projectPath: string; projectName: string; rel: string }

export function QuickOpen() {
  const open = useQuickOpen((s) => s.open)
  return open ? <QuickOpenDialog /> : null
}

function QuickOpenDialog() {
  const workspaces = useWorkspaces((s) => s.workspaces)
  const indexes = useFiles((s) => s.indexes)
  const projects = useMemo(() => uniqueProjects(workspaces), [workspaces])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    for (const p of projects) void useFiles.getState().ensureIndex(p.path)
  }, [projects])

  const all = useMemo<Hit[]>(
    () => projects.flatMap((p) => (indexes[p.path] ?? []).map((rel) => ({ projectPath: p.path, projectName: p.name, rel }))),
    [projects, indexes],
  )
  const hits = useMemo(() => fuzzyFilter(query.trim(), all, (h) => `${h.projectName}/${h.rel}`, 50), [query, all])
  const current = Math.min(active, Math.max(hits.length - 1, 0))
  const hide = () => useQuickOpen.getState().hide()
  const choose = (hit: Hit | undefined) => {
    if (!hit) return
    hide()
    useDock.getState().openFile({ type: 'file', projectPath: hit.projectPath, filePath: `${hit.projectPath}/${hit.rel}` })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-24" onMouseDown={hide}>
      <div
        role="dialog"
        aria-label="Busca rápida"
        className="h-fit w-[560px] max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Buscar arquivo"
          placeholder="Buscar arquivo em todos os projetos…"
          className="w-full rounded-t-lg bg-transparent px-3 py-2 text-sm text-neutral-100 outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') hide()
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (hits.length) setActive((current + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(hits[current])
            }
          }}
        />
        <ul role="listbox" aria-label="Arquivos encontrados" className="max-h-80 overflow-auto border-t border-neutral-800 py-1 text-xs">
          {hits.length === 0 && <li className="px-3 py-1 text-neutral-500">{all.length ? 'nenhum arquivo' : 'indexando…'}</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.projectPath}/${h.rel}`}
              role="option"
              aria-selected={i === current}
              className={`flex cursor-pointer gap-2 px-3 py-1 ${i === current ? 'bg-neutral-800' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h)
              }}
            >
              <span className="truncate text-neutral-100">{h.rel}</span>
              <span className="ml-auto shrink-0 text-neutral-500">{h.projectName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
