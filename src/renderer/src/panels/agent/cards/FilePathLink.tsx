import { useContext } from 'react'
import { projectPaths } from '@shared/workspaces'
import { projectForPath, resolveToolPath } from '../../../agent/toolLinks'
import { useDock } from '../../../dock/dockStore'
import { useWorkspaces } from '../../../stores/workspaceStore'
import { AgentPanelContext } from '../agentPanelContext'

export function FilePathLink({ path, line, className = '' }: { path: string; line?: number | undefined; className?: string }) {
  const { projectPath } = useContext(AgentPanelContext)
  const abs = resolveToolPath(projectPath, path)
  return (
    <button
      type="button"
      data-testid="file-link"
      title={abs}
      className={`truncate text-left underline-offset-2 hover:text-neutral-100 hover:underline ${className}`}
      onClick={(e) => {
        // Links live inside <summary>: don't also toggle the card.
        e.preventDefault()
        e.stopPropagation()
        const owner = projectForPath(projectPaths(useWorkspaces.getState().workspaces), abs) ?? projectPath
        useDock.getState().openFile({ type: 'file', projectPath: owner, filePath: abs, ...(line ? { line } : {}) })
      }}
    >
      {path}
      {line ? `:${line}` : ''}
    </button>
  )
}
