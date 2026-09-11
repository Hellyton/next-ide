import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '@shared/files'
import type { FilePanelParams } from '@shared/models'
import { highlight } from '../../files/highlighter'
import { langForPath } from '../../files/languages'
import { relPath } from '../../files/tree'

const NOTICE: Partial<Record<FileContent['kind'], string>> = {
  binary: 'Arquivo binário — não exibido.',
  'too-large': 'Arquivo maior que 2 MB — não exibido.',
  missing: 'Arquivo não encontrado (removido ou renomeado).',
  forbidden: 'Arquivo fora das pastas dos workspaces — não exibido.',
}

export function FilePanel({ params }: IDockviewPanelProps<FilePanelParams>) {
  const [content, setContent] = useState<FileContent | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    window.api
      .invoke('fs:read', params.filePath)
      .then(async (c) => {
        if (!alive) return
        setContent(c)
        setError(null)
        const h = c.kind === 'text' ? await highlight(c.text, langForPath(params.filePath)) : null
        if (alive) setHtml(h)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [params.filePath, version])

  useEffect(
    () =>
      window.api.on('fs:changed', (projectPath, paths) => {
        if (projectPath === params.projectPath && (paths.includes(params.filePath) || paths.includes(projectPath))) {
          setVersion((v) => v + 1)
        }
      }),
    [params.projectPath, params.filePath],
  )

  useEffect(() => {
    const root = codeRef.current
    if (!root || !html) return
    root.querySelectorAll('.line-target').forEach((el) => el.classList.remove('line-target'))
    if (!params.line) return
    const line = root.querySelectorAll('.line')[params.line - 1]
    line?.classList.add('line-target')
    line?.scrollIntoView({ block: 'center' })
  }, [html, params.line])

  return (
    <div className="flex h-full flex-col bg-neutral-950" data-testid="file-panel">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1 text-xs text-neutral-400">
        <span className="min-w-0 flex-1 truncate" title={params.filePath}>
          {relPath(params.projectPath, params.filePath)}
        </span>
        {/* Task 6 adds the "Mencionar no agente" button here */}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <div className="p-3 text-sm text-red-400">Falha ao abrir: {error}</div>}
        {!error && content && NOTICE[content.kind] && (
          <div data-testid="file-notice" className="p-3 text-sm text-neutral-400">
            {NOTICE[content.kind]}
          </div>
        )}
        {!error && content?.kind === 'image' && (
          <div className="flex h-full items-center justify-center p-4">
            <img alt={params.filePath} src={content.dataUrl} className="max-h-full max-w-full object-contain" />
          </div>
        )}
        {!error && content?.kind === 'text' && html && (
          // shiki escapes the source text; the markup is its own <pre><code><span class="line">.
          <div ref={codeRef} data-testid="file-code" className="file-code text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
