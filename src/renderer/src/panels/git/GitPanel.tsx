import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useMemo, useState } from 'react'
import { nextSync, parseDiff, type DiffLine, type GitSyncAction } from '@shared/git'
import type { GitPanelParams } from '@shared/models'
import { basename } from '@shared/workspaces'
import { BranchPicker } from '../../git/BranchPicker'
import { useGitOverview } from '../../git/useGitOverview'

const STATUS_CLASS = { M: 'text-amber-400', A: 'text-emerald-400', U: 'text-emerald-400', D: 'text-red-400', R: 'text-sky-400' } as const
const LINE_CLASS: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-950/60 text-emerald-200',
  del: 'bg-red-950/60 text-red-200',
  hunk: 'bg-sky-950/20 text-sky-400',
  ctx: 'text-neutral-400',
}
const LINE_MARK: Record<DiffLine['kind'], string> = { add: '+', del: '-', hunk: '', ctx: ' ' }
const SYNC_LABEL: Record<GitSyncAction, string> = { fetch: 'Buscar do remoto', pull: 'Puxar', push: 'Enviar' }

/** Changes, commit and sync for one project, in the spirit of GitHub Desktop. */
export function GitPanel({ params }: IDockviewPanelProps<GitPanelParams>) {
  const { projectPath } = params
  const { overview, refresh } = useGitOverview(projectPath)
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffLine[] | null>(null)
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState<'commit' | 'sync' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const { changes } = overview
  const current = changes.some((c) => c.path === selected) ? selected : (changes[0]?.path ?? null)
  const chosen = useMemo(() => changes.filter((c) => !skipped.has(c.path)).map((c) => c.path), [changes, skipped])

  useEffect(() => {
    if (!current) return setDiff(null)
    let alive = true
    void window.api.invoke('git:diff', projectPath, current).then((r) => {
      if (alive) setDiff(r.ok ? parseDiff(r.value) : [])
    })
    return () => {
      alive = false
    }
    // `changes` too: the same file can change again while it stays selected.
  }, [projectPath, current, changes])

  const run = (kind: 'commit' | 'sync', task: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: () => void) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    void task()
      .then((r) => (r.ok ? done?.() : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy(null)
        refresh()
      })
  }
  const commit = () =>
    run(
      'commit',
      () => window.api.invoke('git:commit', projectPath, chosen, summary, description),
      () => {
        setSummary('')
        setDescription('')
        setSkipped(new Set())
      },
    )
  const action = nextSync(overview)
  const sync = () => run('sync', () => window.api.invoke('git:sync', projectPath, action))
  const toggle = (path: string) =>
    setSkipped((s) => {
      const next = new Set(s)
      if (!next.delete(path)) next.add(path)
      return next
    })
  const allOn = chosen.length === changes.length

  if (overview.branch === null) {
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">{basename(projectPath)} não é um repositório git.</div>
  }

  return (
    <div className="flex h-full text-xs text-neutral-300" data-testid="git-panel">
      <div className="flex w-80 shrink-0 flex-col border-r border-neutral-800">
        <div className="relative flex items-center gap-2 border-b border-neutral-800 px-2 py-1.5">
          <button data-testid="git-branch" className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-neutral-800" title="Trocar de branch" onClick={() => setPicking((p) => !p)}>
            <span className="text-neutral-500">⎇ </span>
            {overview.branch}
          </button>
          <button data-testid="git-sync" disabled={busy !== null} className="shrink-0 rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700 disabled:opacity-50" onClick={sync}>
            {busy === 'sync' ? 'Aguarde…' : action === 'push' && !overview.upstream ? 'Publicar branch' : SYNC_LABEL[action]}
            {overview.behind > 0 && <span className="ml-1 text-sky-400">↓{overview.behind}</span>}
            {overview.ahead > 0 && <span className="ml-1 text-orange-400">↑{overview.ahead}</span>}
          </button>
          {picking && <BranchPicker projectPath={projectPath} onClose={() => setPicking(false)} onSwitched={refresh} className="absolute top-full left-2 mt-1" />}
        </div>
        <label className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1 text-neutral-500">
          <input
            type="checkbox"
            checked={allOn && changes.length > 0}
            disabled={changes.length === 0}
            onChange={() => setSkipped(allOn ? new Set(changes.map((c) => c.path)) : new Set())}
          />
          {changes.length === 0 ? 'Nenhuma alteração' : `${changes.length} arquivo${changes.length > 1 ? 's' : ''} alterado${changes.length > 1 ? 's' : ''}`}
        </label>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {changes.map((c) => (
            <div
              key={c.path}
              data-testid="git-change"
              title={c.path}
              className={`flex cursor-pointer items-center gap-2 px-3 py-0.5 ${c.path === current ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'}`}
              onClick={() => setSelected(c.path)}
            >
              <input type="checkbox" checked={!skipped.has(c.path)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(c.path)} />
              <span className="min-w-0 flex-1 truncate" style={{ direction: 'rtl', textAlign: 'left' }}>
                <bdi>{c.path}</bdi>
              </span>
              <span className={`w-3 shrink-0 text-center font-mono ${STATUS_CLASS[c.status]}`}>{c.status}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-neutral-800 p-2">
          {error && <div className="max-h-32 overflow-auto rounded bg-red-950/60 px-2 py-1 whitespace-pre-wrap text-red-300">{error}</div>}
          <input
            data-testid="git-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
            }}
            placeholder="Resumo (obrigatório)"
            className="w-full rounded bg-neutral-900 px-2 py-1 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição"
            rows={3}
            className="w-full resize-none rounded bg-neutral-900 px-2 py-1 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
          />
          <button
            data-testid="git-commit"
            disabled={busy !== null || !summary.trim() || chosen.length === 0}
            className="w-full rounded bg-orange-600 px-2 py-1.5 font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            onClick={commit}
          >
            {busy === 'commit' ? 'Commitando…' : `Commit em ${overview.branch}`}
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto font-mono text-[12px] leading-5" data-testid="git-diff">
        {current && <div className="sticky top-0 border-b border-neutral-800 bg-neutral-900 px-3 py-1 font-sans text-neutral-400">{current}</div>}
        {!current && <div className="flex h-full items-center justify-center font-sans text-sm text-neutral-600">Sem alterações locais.</div>}
        {current && diff?.length === 0 && <div className="px-3 py-2 font-sans text-neutral-500">Sem diff de texto para exibir (binário, vazio ou grande demais).</div>}
        {diff?.map((line, i) => (
          <div key={i} className={`px-3 whitespace-pre ${LINE_CLASS[line.kind]}`}>
            <span className="mr-2 inline-block w-2 select-none opacity-60">{LINE_MARK[line.kind]}</span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
