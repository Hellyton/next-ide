import { useEffect } from 'react'
import type { FsEntry } from '@shared/files'
import { useDock } from '../dock/dockStore'
import { FileIcon } from '../files/FileTypeIcon'
import { entryStatus, STATUS_CLASS } from '../files/tree'
import { useFiles } from '../stores/filesStore'
import { Chevron } from './Chevron'

export function FileTree({ projectPath, dir, depth }: { projectPath: string; dir: string; depth: number }) {
  const entries = useFiles((s) => s.children[dir])
  const error = useFiles((s) => s.errors[dir])
  useEffect(() => {
    if (!entries && !error) void useFiles.getState().loadDir(projectPath, dir)
  }, [entries, error, projectPath, dir])
  const pad = { paddingLeft: `${depth * 12 + 8}px` }
  if (error) return <div style={pad} className="py-0.5 text-xs text-red-400">{error}</div>
  if (!entries) return <div style={pad} className="py-0.5 text-xs text-neutral-600">carregando…</div>
  if (entries.length === 0) return <div style={pad} className="py-0.5 text-xs text-neutral-600">vazio</div>
  return (
    <>
      {entries.map((entry) => (
        <FileTreeRow key={entry.path} projectPath={projectPath} entry={entry} depth={depth} />
      ))}
    </>
  )
}

function FileTreeRow({ projectPath, entry, depth }: { projectPath: string; entry: FsEntry; depth: number }) {
  const open = useFiles((s) => s.expanded[entry.path] === true)
  const status = useFiles((s) => entryStatus(s.status[projectPath], projectPath, entry))
  const onClick = () =>
    entry.kind === 'dir'
      ? useFiles.getState().toggleDir(projectPath, entry.path)
      : useDock.getState().openFile({ type: 'file', projectPath, filePath: entry.path })
  return (
    <>
      <button
        data-testid="tree-row"
        data-status={status ?? ''}
        title={entry.path}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`flex w-full items-center gap-1 rounded py-0.5 pr-1 text-left text-xs hover:bg-neutral-800/70 ${status ? STATUS_CLASS[status] : 'text-neutral-300'}`}
        onClick={onClick}
      >
        <span className="flex w-4 shrink-0 justify-center text-neutral-400">{entry.kind === 'dir' && <Chevron open={open} />}</span>
        <FileIcon name={entry.name} isDir={entry.kind === 'dir'} open={open} />
        <span className="truncate">{entry.name}</span>
        {status && entry.kind === 'file' && <span className="ml-auto pl-1 text-[10px]">{status}</span>}
      </button>
      {entry.kind === 'dir' && open && <FileTree projectPath={projectPath} dir={entry.path} depth={depth + 1} />}
    </>
  )
}
