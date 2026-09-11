import { useEffect, useState } from 'react'
import { filterWorkspaces } from '@shared/workspaces'
import { useFiles } from '../stores/filesStore'
import { useWorkspaces } from '../stores/workspaceStore'
import { ActiveSessions } from './ActiveSessions'
import { WorkspaceSection } from './WorkspaceSection'

export function Sidebar() {
  const workspaces = useWorkspaces((s) => s.workspaces)
  const query = useWorkspaces((s) => s.query)
  const expanded = useFiles((s) => s.expanded)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    void useWorkspaces.getState().load()
  }, [])

  const visible = filterWorkspaces(workspaces, query, (p) => expanded[p.path] === true)

  return (
    <div className="flex h-full flex-col">
      <div className="h-9 shrink-0 [-webkit-app-region:drag]" />
      <div className="px-3 pb-2">
        <input
          placeholder="Filtrar projetos"
          className="w-full rounded bg-neutral-900 px-2 py-1 text-sm outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
          value={query}
          onChange={(e) => useWorkspaces.getState().setQuery(e.target.value)}
        />
      </div>
      <ActiveSessions />
      <section className="flex-1 overflow-y-auto px-2">
        <div className="flex items-center px-2 pb-1">
          <h2 className="flex-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Workspaces</h2>
          <button
            aria-label="Novo workspace"
            title="Novo workspace"
            className="rounded px-1 text-neutral-400 hover:bg-neutral-800"
            onClick={() => setCreating(true)}
          >
            +
          </button>
          <button
            aria-label="Importar .code-workspace"
            title="Importar .code-workspace"
            className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
            onClick={() => void useWorkspaces.getState().importCodeWorkspace()}
          >
            ⇪
          </button>
        </div>
        {creating && (
          <input
            autoFocus
            placeholder="Nome do workspace"
            className="mx-2 mb-2 w-[calc(100%-1rem)] rounded bg-neutral-900 px-2 py-1 text-sm outline-none ring-1 ring-neutral-700"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setCreating(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                useWorkspaces.getState().addWorkspace(name)
                setName('')
                setCreating(false)
              }
              if (e.key === 'Escape') setCreating(false)
            }}
          />
        )}
        {visible.map((w) => (
          <WorkspaceSection key={w.id} workspace={w} draggable={!query.trim()} />
        ))}
      </section>
    </div>
  )
}
