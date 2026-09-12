import { useEffect, useMemo } from 'react'
import { fuzzyFilter } from '@shared/fuzzy'
import { useDock } from '../dock/dockStore'
import { FileIcon } from '../files/FileTypeIcon'
import { useFiles } from '../stores/filesStore'

export function FileSearchResults({ projectPath, query }: { projectPath: string; query: string }) {
  const index = useFiles((s) => s.indexes[projectPath])
  useEffect(() => {
    void useFiles.getState().ensureIndex(projectPath)
  }, [projectPath])
  const hits = useMemo(() => fuzzyFilter(query.trim(), index ?? [], (s) => s, 50), [query, index])
  if (!index) return <div className="py-0.5 pl-8 text-xs text-neutral-600">indexando…</div>
  if (hits.length === 0) return <div className="py-0.5 pl-8 text-xs text-neutral-600">nenhum arquivo</div>
  return (
    <>
      {hits.map((rel) => (
        <button
          key={rel}
          data-testid="file-search-result"
          title={rel}
          className="flex w-full items-center gap-1 rounded py-0.5 pr-1 pl-8 text-left text-xs text-neutral-300 hover:bg-neutral-800/70"
          onClick={() => useDock.getState().openFile({ type: 'file', projectPath, filePath: `${projectPath}/${rel}` })}
        >
          <FileIcon name={rel.slice(rel.lastIndexOf('/') + 1)} />
          <span className="truncate">{rel}</span>
        </button>
      ))}
    </>
  )
}
