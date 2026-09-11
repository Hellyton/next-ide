import type { Project } from '@shared/models'
import { projectColor } from '@shared/projectColor'
import { useDock } from '../dock/dockStore'
import { useFiles } from '../stores/filesStore'
import { useSessions } from '../stores/sessionsStore'
import { useWorkspaces } from '../stores/workspaceStore'
import { FileSearchResults } from './FileSearchResults'
import { FileTree } from './FileTree'
import { useGitBranch } from './useGitBranch'

export function ProjectRow({ project, onRemove }: { project: Project; onRemove: () => void }) {
  const branch = useGitBranch(project.path)
  const count = useSessions((s) => s.order.filter((id) => s.byId[id]!.projectPath === project.path).length)
  const expanded = useFiles((s) => s.expanded[project.path] === true)
  const query = useWorkspaces((s) => s.query)
  const open = (type: 'agent' | 'terminal') => useDock.getState().open({ type, projectPath: project.path })
  return (
    <>
      <div
        data-testid="project-row"
        title={project.path}
        className="group flex items-center gap-2 rounded py-1 pr-1 pl-1 text-sm hover:bg-neutral-800/70"
      >
        <button
          aria-label={expanded ? `Recolher arquivos de ${project.name}` : `Expandir arquivos de ${project.name}`}
          className="w-4 shrink-0 text-xs text-neutral-500"
          onClick={() => useFiles.getState().toggleDir(project.path, project.path)}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: projectColor(project.path) }} />
        <span className="min-w-0 flex-1 truncate">
          {project.name}
          {branch && <span className="ml-1 text-xs text-neutral-500">({branch})</span>}
        </span>
        {count > 0 && <span className="text-[10px] text-blue-400">●{count}</span>}
        <button
          aria-label={`Abrir Claude em ${project.name}`}
          title="Abrir Claude"
          className="rounded px-1 text-neutral-400 hover:bg-neutral-700 hover:text-orange-400"
          onClick={() => open('agent')}
        >
          ▶
        </button>
        <button
          aria-label={`Abrir terminal em ${project.name}`}
          title="Abrir terminal"
          className="rounded px-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          onClick={() => open('terminal')}
        >
          ⌨
        </button>
        <button
          aria-label={`Remover ${project.name}`}
          className="invisible rounded px-1 text-neutral-500 group-hover:visible hover:text-red-400"
          onClick={() => {
            if (window.confirm(`Tem certeza que deseja remover o diretório "${project.name}" do workspace?\n\nOs arquivos no disco não são apagados.`)) onRemove()
          }}
        >
          ×
        </button>
      </div>
      {expanded &&
        (query.trim() ? (
          <FileSearchResults projectPath={project.path} query={query} />
        ) : (
          <FileTree projectPath={project.path} dir={project.path} depth={1} />
        ))}
    </>
  )
}
