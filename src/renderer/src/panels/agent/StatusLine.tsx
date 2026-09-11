import { useEffect, useMemo, useRef, useState } from 'react'
import { basename } from '@shared/workspaces'
import { STATUS_SEGMENTS, type StatusSegmentId } from '@shared/models'
import type { ChatState } from '../../agent/chatReducer'
import { ansiToSpans } from '../../agent/ansi'
import { SEGMENT_LABELS, buildSegments, buildStatusLineInput, lineStats, type StatusContext } from '../../agent/statusline'
import { useAgents } from '../../stores/agentStore'
import { useSettings } from '../../stores/settingsStore'
import { useGitBranch } from '../../sidebar/useGitBranch'

type Props = { projectPath: string; chat: ChatState; configOpen: boolean; onConfigClose(): void; onConfigOpen(): void }

/** Re-runs the user's script this often so countdowns (rate-limit resets, duration) stay fresh. */
const SCRIPT_REFRESH_MS = 60_000

export function StatusLine({ projectPath, chat, configOpen, onConfigClose, onConfigOpen }: Props) {
  const settings = useSettings((s) => s.settings)
  const branch = useGitBranch(projectPath)
  const rateLimits = useAgents((s) => s.rateLimits)
  const [scriptOut, setScriptOut] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const openedAt = useRef(Date.now())
  useEffect(() => void useSettings.getState().load(), [])

  const lines = useMemo(() => lineStats(chat.items), [chat.items])
  const usage = chat.stats?.usage
  const ctx: StatusContext = {
    projectName: basename(projectPath),
    branch,
    ...(chat.model ? { model: chat.model } : {}),
    ...(chat.stats?.contextPct !== undefined ? { contextPct: chat.stats.contextPct } : {}),
    ...(chat.stats?.contextWindow !== undefined ? { contextWindow: chat.stats.contextWindow } : {}),
    ...(chat.stats?.contextTokens !== undefined ? { contextTokens: chat.stats.contextTokens } : {}),
    tokens: usage ? usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens : 0,
    costUsd: chat.totalCostUsd,
    ...(chat.stats ? { durationMs: chat.stats.durationMs } : {}),
    sessionDurationMs: Date.now() - openedAt.current,
    linesAdded: lines.added,
    linesRemoved: lines.removed,
    ...(chat.version ? { version: chat.version } : {}),
    rateLimits,
    ...(chat.permissionMode ? { mode: chat.permissionMode } : {}),
  }
  const segments = buildSegments(settings.statusline.segments, ctx)

  useEffect(() => {
    if (!settings.statusline.customScript) return
    const timer = setInterval(() => setTick((t) => t + 1), SCRIPT_REFRESH_MS)
    return () => clearInterval(timer)
  }, [settings.statusline.customScript])

  useEffect(() => {
    if (!settings.statusline.customScript) return setScriptOut(null)
    window.api
      .invoke('statusline:run', buildStatusLineInput({ ...ctx, cwd: projectPath, ...(chat.sessionId ? { sessionId: chat.sessionId } : {}) }))
      .then(setScriptOut)
      .catch(() => setScriptOut(null))
    // Re-run after each turn (stats), on model/mode/version change, new rate limits, the refresh
    // tick, or when the toggle flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.statusline.customScript, chat.stats, chat.model, chat.permissionMode, chat.version, rateLimits, tick])

  const spans = useMemo(() => (scriptOut ? ansiToSpans(scriptOut) : []), [scriptOut])
  // Like the CLI: when the user's script prints something, it is the whole status line.
  const showScript = settings.statusline.customScript && spans.length > 0
  const toggle = (id: StatusSegmentId, on: boolean) => {
    const current = settings.statusline.segments
    const segments = on ? STATUS_SEGMENTS.filter((s) => s === id || current.includes(s)) : current.filter((s) => s !== id)
    useSettings.getState().update({ statusline: { ...settings.statusline, segments } })
  }

  return (
    <div className="relative border-t border-neutral-900 px-3 py-1 text-[11px] text-neutral-500" data-testid="status-line">
      {/* Wraps instead of truncating: narrow split panes still show everything. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {showScript ? (
            <div className="font-mono break-words whitespace-pre-wrap">
              {spans.map((s, i) => (
                <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
                  {s.text}
                </span>
              ))}
            </div>
          ) : (
            <span className="flex flex-wrap gap-x-1.5">
              {segments.map((s, i) => (
                <span key={s.id} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-1.5 text-neutral-700">·</span>}
                  {s.text}
                </span>
              ))}
            </span>
          )}
        </div>
        <button aria-label="Configurar statusline" className="shrink-0 rounded px-1 hover:bg-neutral-800" onClick={onConfigOpen}>
          ⚙
        </button>
      </div>
      {configOpen && (
        <div role="dialog" aria-label="Configurar statusline" className="absolute right-2 bottom-full z-10 mb-1 w-64 rounded border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-300">
          {STATUS_SEGMENTS.map((id) => (
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
