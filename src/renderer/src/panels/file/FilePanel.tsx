import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '@shared/files'
import type { FilePanelParams } from '@shared/models'
import type { LineRange } from '../../agent/mentions'
import { mentionInAgent } from '../../dock/mention'
import { highlight } from '../../files/highlighter'
import { langForPath } from '../../files/languages'
import { relPath } from '../../files/tree'

/** 1-based line numbers covered by the current text selection inside the code view, if any. */
function selectedLineRange(root: HTMLElement | null): LineRange | null {
  const sel = window.getSelection()
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const lines = Array.from(root.querySelectorAll('.line'))
  const lineOf = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement
    const line = el?.closest('.line')
    return line && root.contains(line) ? lines.indexOf(line) + 1 : 0
  }
  const a = lineOf(sel.anchorNode)
  const b = lineOf(sel.focusNode)
  return a && b ? { start: Math.min(a, b), end: Math.max(a, b) } : null
}

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
        <button
          className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700"
          onMouseDown={(e) => e.preventDefault() /* keep the code selection */}
          onClick={() => mentionInAgent(params.projectPath, params.filePath, selectedLineRange(codeRef.current))}
        >
          Mencionar no agente
        </button>
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
