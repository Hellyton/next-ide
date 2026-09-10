import { useEffect, useState } from 'react'
import type { Workspace } from '@shared/models'
import { useWorkspaces } from '../stores/workspaceStore'
import { ProjectRow } from './ProjectRow'

export function WorkspaceSection({ workspace }: { workspace: Workspace }) {
  const { toggle, rename, remove, addFolder, removeProject } = useWorkspaces.getState()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(workspace.name)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!confirmRemove) return
    const t = setTimeout(() => setConfirmRemove(false), 3000)
    return () => clearTimeout(t)
  }, [confirmRemove])

  return (
    <div className="pb-1">
      <div data-testid="workspace-header" className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-neutral-800/50">
        <button
          aria-label={workspace.collapsed ? `Expandir ${workspace.name}` : `Recolher ${workspace.name}`}
          className="w-4 text-xs text-neutral-500"
          onClick={() => toggle(workspace.id)}
        >
          {workspace.collapsed ? '▸' : '▾'}
        </button>
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded bg-neutral-900 px-1 text-sm outline-none ring-1 ring-neutral-700"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                rename(workspace.id, draft)
                setEditing(false)
              }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium"
            onDoubleClick={() => {
              setDraft(workspace.name)
              setEditing(true)
            }}
          >
            {workspace.name}
          </span>
        )}
        <button
          aria-label={`Adicionar pasta em ${workspace.name}`}
          title="Adicionar pasta"
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-700"
          onClick={() => void addFolder(workspace.id)}
        >
          +
        </button>
        <button
          aria-label={`Remover workspace ${workspace.name}`}
          className={`rounded px-1 text-xs ${confirmRemove ? 'text-red-400' : 'invisible text-neutral-500 group-hover:visible'}`}
          onClick={() => (confirmRemove ? remove(workspace.id) : setConfirmRemove(true))}
        >
          {confirmRemove ? 'remover?' : '×'}
        </button>
      </div>
      {!workspace.collapsed &&
        workspace.projects.map((p) => (
          <ProjectRow key={p.id} project={p} onRemove={() => removeProject(workspace.id, p.id)} />
        ))}
    </div>
  )
}
