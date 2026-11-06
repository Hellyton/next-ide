import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '@shared/files'
import type { FilePanelParams } from '@shared/models'
import type { LineRange } from '../../agent/mentions'
import { mentionInAgent } from '../../dock/mention'
import { highlight } from '../../files/highlighter'
import { langForPath } from '../../files/languages'
import { relPath } from '../../files/tree'
import { useFiles } from '../../stores/filesStore'
import { modLabel } from '../../platform'

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
const HIGHLIGHT_DEBOUNCE_MS = 120
const byteLength = (text: string) => new TextEncoder().encode(text).length

export function FilePanel({ params }: IDockviewPanelProps<FilePanelParams>) {
  const [content, setContent] = useState<FileContent | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  /** Non-null while editing: the working copy of the file. */
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [changedOnDisk, setChangedOnDisk] = useState(false)
  const codeRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const saved = content?.kind === 'text' ? content.text : ''
  const editing = draft !== null
  const dirty = editing && draft !== saved
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    let alive = true
    window.api
      .invoke('fs:read', params.filePath)
      .then((next) => {
        if (!alive) return
        setContent(next)
        setError(null)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [params.filePath, version])

  // Highlight whatever is on screen: the saved file, or the draft while typing (debounced).
  useEffect(() => {
    const source = editing ? draft : content?.kind === 'text' ? content.text : null
    if (source === null || source === undefined) {
      setHtml(null)
      return
    }
    let alive = true
    const run = () => {
      void highlight(source, langForPath(params.filePath))
        .then((next) => alive && setHtml(next))
        .catch(() => alive && setHtml(null))
    }
    if (!editing) {
      run()
      return () => {
        alive = false
      }
    }
    const timer = setTimeout(run, HIGHLIGHT_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [editing, draft, content, params.filePath])

  useEffect(
    () =>
      window.api.on('fs:changed', (projectPath, paths) => {
        if (projectPath !== params.projectPath || !(paths.includes(params.filePath) || paths.includes(projectPath))) return
        // Never throw away what the user is typing: offer a reload instead.
        if (dirtyRef.current) setChangedOnDisk(true)
        else setVersion((v) => v + 1)
      }),
    [params.projectPath, params.filePath],
  )

  // Tabs and the dock's close confirmation need to know about unsaved edits.
  useEffect(() => {
    useFiles.getState().setDirty(params.filePath, dirty)
    return () => useFiles.getState().setDirty(params.filePath, false)
  }, [dirty, params.filePath])

  useEffect(() => {
    const root = codeRef.current
    if (!root || !html || editing) return
    root.querySelectorAll('.line-target').forEach((el) => el.classList.remove('line-target'))
    if (!params.line) return
    const line = root.querySelectorAll('.line')[params.line - 1]
    line?.classList.add('line-target')
    line?.scrollIntoView({ block: 'center' })
  }, [html, params.line, editing])

  const startEditing = () => {
    setDraft(saved)
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  const save = async () => {
    if (draft === null || saving) return
    setSaving(true)
    const result = await window.api
      .invoke('fs:write', params.filePath, draft)
      .catch((err) => ({ ok: false as const, message: err instanceof Error ? err.message : String(err) }))
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setContent({ kind: 'text', text: draft, size: byteLength(draft) })
    setChangedOnDisk(false)
    setError(null)
  }

  const reloadFromDisk = () => {
    setDraft(null)
    setChangedOnDisk(false)
    setVersion((v) => v + 1)
  }

  const label = relPath(params.projectPath, params.filePath)

  return (
    <div
      className="flex h-full flex-col"
      data-testid="file-panel"
      onKeyDownCapture={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editing) {
          e.preventDefault()
          e.stopPropagation()
          void save()
        } else if (e.key === 'Escape' && editing && !dirty) {
          setDraft(null)
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1 text-xs text-neutral-400">
        <span className="min-w-0 flex-1 truncate" title={params.filePath}>
          {dirty && <span data-testid="file-dirty" className="mr-1 text-orange-400">●</span>}
          {label}
        </span>
        {content?.kind === 'text' &&
          (editing ? (
            <>
              <button
                data-testid="file-save"
                className="rounded bg-orange-600 px-2 py-0.5 text-white hover:bg-orange-500 disabled:opacity-40"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : `Salvar ${modLabel('S')}`}
              </button>
              <button className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700" onClick={() => setDraft(null)}>
                {dirty ? 'Descartar' : 'Fechar edição'}
              </button>
            </>
          ) : (
            <button data-testid="file-edit" className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700" onClick={startEditing}>
              Editar
            </button>
          ))}
        <button
          className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700"
          onMouseDown={(e) => e.preventDefault() /* keep the code selection */}
          onClick={() => mentionInAgent(params.projectPath, params.filePath, selectedLineRange(codeRef.current))}
        >
          Mencionar no agente
        </button>
      </div>
      {changedOnDisk && (
        <div data-testid="file-stale" className="flex items-center gap-2 border-b border-amber-800 bg-amber-950/30 px-3 py-1 text-xs text-amber-200">
          <span className="flex-1">O arquivo mudou no disco enquanto você editava.</span>
          <button className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-100 hover:bg-neutral-700" onClick={reloadFromDisk}>
            Recarregar do disco
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <div className="p-3 text-sm text-red-400">Falha: {error}</div>}
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
        {!error && content?.kind === 'text' && (
          <div className="relative min-h-full">
            {/* shiki escapes the source text; the markup is its own <pre><code><span class="line">. */}
            <div ref={codeRef} data-testid="file-code" className="file-code text-[13px]" dangerouslySetInnerHTML={{ __html: html ?? '' }} />
            {editing && (
              <textarea
                ref={editorRef}
                data-testid="file-editor"
                aria-label={`Editar ${label}`}
                spellCheck={false}
                className="file-editor absolute inset-0 h-full w-full resize-none border-0 bg-transparent text-transparent caret-neutral-100 outline-none"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return
                  e.preventDefault()
                  const el = e.currentTarget
                  const { selectionStart: start, selectionEnd: end } = el
                  setDraft(`${draft.slice(0, start)}  ${draft.slice(end)}`)
                  requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
