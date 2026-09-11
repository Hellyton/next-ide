import type { StatusLineInput } from '@shared/agent'
import type { PermissionMode, SessionState, StatusSegmentId } from '@shared/models'
import { MODE_OPTIONS } from './permissions'

export type StatusContext = {
  projectName: string
  branch: string | null
  model?: string
  contextPct?: number
  tokens: number
  costUsd: number
  durationMs?: number
  mode?: PermissionMode
  state: SessionState
}

export const SEGMENT_LABELS: Record<StatusSegmentId, string> = {
  project: 'projeto',
  branch: 'branch',
  model: 'modelo',
  context: 'contexto %',
  tokens: 'tokens',
  cost: 'custo',
  duration: 'duração',
  mode: 'modo',
  state: 'estado',
  customScript: 'script do ~/.claude (statusLine)',
}

const STATE_LABELS: Record<SessionState, string> = {
  starting: 'iniciando',
  idle: 'ocioso',
  running: 'rodando',
  awaiting_permission: 'aguardando você',
  error: 'erro',
  exited: 'encerrado',
}

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`
export const formatTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

export function buildSegments(ids: StatusSegmentId[], ctx: StatusContext): Array<{ id: StatusSegmentId; text: string }> {
  const text = (id: StatusSegmentId): string | null => {
    switch (id) {
      case 'project':
        return ctx.projectName
      case 'branch':
        return ctx.branch
      case 'model':
        return ctx.model ?? null
      case 'context':
        return ctx.contextPct === undefined ? null : `contexto ${ctx.contextPct}%`
      case 'tokens':
        return ctx.tokens > 0 ? `${formatTokens(ctx.tokens)} tokens` : null
      case 'cost':
        return formatCost(ctx.costUsd)
      case 'duration':
        return ctx.durationMs === undefined ? null : formatDuration(ctx.durationMs)
      case 'mode':
        return ctx.mode ? (MODE_OPTIONS.find((m) => m.value === ctx.mode)?.label ?? ctx.mode) : null
      case 'state':
        return STATE_LABELS[ctx.state]
      case 'customScript':
        return null
    }
  }
  return ids.flatMap((id) => {
    const value = text(id)
    return value ? [{ id, text: value }] : []
  })
}

export function buildStatusLineInput(ctx: StatusContext & { sessionId?: string; cwd: string }): StatusLineInput {
  return {
    session_id: ctx.sessionId ?? '',
    cwd: ctx.cwd,
    model: { id: ctx.model ?? '', display_name: ctx.model ?? '' },
    workspace: { current_dir: ctx.cwd, project_dir: ctx.cwd },
    cost: { total_cost_usd: ctx.costUsd, total_duration_ms: ctx.durationMs ?? 0 },
    ...(ctx.contextPct !== undefined
      ? { context_window: { context_window_size: 0, used_percentage: ctx.contextPct, total_input_tokens: ctx.tokens } }
      : {}),
  }
}
