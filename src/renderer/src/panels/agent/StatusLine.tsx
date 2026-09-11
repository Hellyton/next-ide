import { useEffect, useMemo, useState } from 'react'
import { basename } from '@shared/workspaces'
import type { StatusSegmentId } from '@shared/models'
import type { ChatState } from '../../agent/chatReducer'
import { ansiToSpans } from '../../agent/ansi'
import { SEGMENT_LABELS, buildSegments, buildStatusLineInput, type StatusContext } from '../../agent/statusline'
import { useSettings } from '../../stores/settingsStore'
import { useGitBranch } from '../../sidebar/useGitBranch'

const ALL: StatusSegmentId[] = ['project', 'branch', 'model', 'context', 'tokens', 'cost', 'duration', 'mode', 'state']

type Props = { projectPath: string; chat: ChatState; configOpen: boolean; onConfigClose(): void; onConfigOpen(): void }

export function StatusLine({ projectPath, chat, configOpen, onConfigClose, onConfigOpen }: Props) {
  const settings = useSettings((s) => s.settings)
  const branch = useGitBranch(projectPath)
  const [scriptOut, setScriptOut] = useState<string | null>(null)
  useEffect(() => void useSettings.getState().load(), [])

  const usage = chat.stats?.usage
  const ctx: StatusContext = {
    projectName: basename(projectPath),
    branch,
    ...(chat.model ? { model: chat.model } : {}),
    ...(chat.stats?.contextPct !== undefined ? { contextPct: chat.stats.contextPct } : {}),
    tokens: usage ? usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens : 0,
    costUsd: chat.totalCostUsd,
    ...(chat.stats ? { durationMs: chat.stats.durationMs } : {}),
    ...(chat.permissionMode ? { mode: chat.permissionMode } : {}),
    state: chat.state,
  }
  const segments = buildSegments(settings.statusline.segments, ctx)

  useEffect(() => {
    if (!settings.statusline.customScript) return setScriptOut(null)
    window.api
      .invoke('statusline:run', buildStatusLineInput({ ...ctx, cwd: projectPath, ...(chat.sessionId ? { sessionId: chat.sessionId } : {}) }))
      .then(setScriptOut)
      .catch(() => setScriptOut(null))
    // Re-run after each turn (stats), on model/mode change, or when the toggle flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.statusline.customScript, chat.stats, chat.model, chat.permissionMode])

  const spans = useMemo(() => (scriptOut ? ansiToSpans(scriptOut) : []), [scriptOut])
  const toggle = (id: StatusSegmentId, on: boolean) => {
    const current = settings.statusline.segments
    const segments = on ? ALL.filter((s) => s === id || current.includes(s)) : current.filter((s) => s !== id)
    useSettings.getState().update({ statusline: { ...settings.statusline, segments } })
  }

  return (
    <div className="relative border-t border-neutral-900 px-3 py-1 text-[11px] text-neutral-500" data-testid="status-line">
      <div className="flex items-center gap-2">
        <span className="truncate">{segments.map((s) => s.text).join(' · ')}</span>
        <span className="ml-auto truncate font-mono">
          {spans.map((s, i) => (
            <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
              {s.text}
            </span>
          ))}
        </span>
        <button aria-label="Configurar statusline" className="rounded px-1 hover:bg-neutral-800" onClick={onConfigOpen}>
          ⚙
        </button>
      </div>
      {configOpen && (
        <div role="dialog" aria-label="Configurar statusline" className="absolute right-2 bottom-7 z-10 w-64 rounded border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-300">
          {ALL.map((id) => (
            <label key={id} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={settings.statusline.segments.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
              {SEGMENT_LABELS[id]}
            </label>
          ))}
          <label className="mt-2 flex items-center gap-2 border-t border-neutral-800 pt-2">
            <input
              type="checkbox"
              checked={settings.statusline.customScript}
              onChange={(e) => useSettings.getState().update({ statusline: { ...settings.statusline, customScript: e.target.checked } })}
            />
            {SEGMENT_LABELS.customScript}
          </label>
          <button className="mt-2 rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700" onClick={onConfigClose}>
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
