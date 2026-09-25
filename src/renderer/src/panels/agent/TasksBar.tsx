import { useEffect, useState } from 'react'
import type { TaskInfo } from '@shared/agent'
import { visibleTasks } from '../../agent/tasks'
import { useAgents } from '../../stores/agentStore'

const FINISHED_VISIBLE_MS = 4000
const secs = (ms?: number) => (ms === undefined ? '' : `${Math.round(ms / 1000)}s`)
const STATUS: Record<Exclude<TaskInfo['status'], 'running'>, string> = { completed: 'concluída', failed: 'falhou', stopped: 'parada' }
const label = (t: TaskInfo) => (t.subagentType ? `${t.subagentType} · ${t.description}` : t.description)

/** Background Bash commands / subagents of this panel; finished ones linger briefly, then disappear. */
export function TasksBar({ panelId, tasks }: { panelId: string; tasks: TaskInfo[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const finishedIds = tasks.filter((t) => t.status !== 'running').map((t) => t.id).join('|')
  useEffect(() => {
    const ids = finishedIds ? finishedIds.split('|') : []
    const idSet = new Set(ids)
    // Drop ids no longer finished (running again, or gone) so a re-finished task can hide again
    // and `hidden` doesn't grow forever.
    setHidden((h) => {
      const next = new Set([...h].filter((id) => idSet.has(id)))
      return next.size === h.size ? h : next
    })
    const timers = ids.filter((id) => !hidden.has(id)).map((id) => setTimeout(() => setHidden((h) => new Set(h).add(id)), FINISHED_VISIBLE_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedIds])
  const visible = visibleTasks(tasks, hidden)
  if (visible.length === 0) return null
  const stop = (t: TaskInfo) =>
    void window.api
      .invoke('agent:stopTask', panelId, t.id)
      .then((r) => !r.ok && useAgents.getState().setNotice(panelId, { text: r.message, command: '' }))
      .catch((err) => useAgents.getState().setNotice(panelId, { text: err instanceof Error ? err.message : String(err), command: '' }))
  return (
    <div data-testid="tasks-bar" className="mx-2 mb-1 space-y-0.5 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs">
      {visible.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className={t.status === 'running' ? 'text-sky-400' : 'text-neutral-500'}>{t.status === 'running' ? '●' : '○'}</span>
          <span className="flex-1 truncate text-neutral-300">{label(t)}</span>
          {t.lastToolName && t.status === 'running' && <span className="text-neutral-500">{t.lastToolName}</span>}
          <span className="text-neutral-500">{t.status === 'running' ? secs(t.durationMs) : STATUS[t.status]}</span>
          {t.status === 'running' && (
            <button aria-label={`Parar tarefa ${t.description}`} className="rounded px-1 text-neutral-400 hover:bg-neutral-800" onClick={() => stop(t)}>
              ■
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
