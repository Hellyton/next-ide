import type { RateLimits, StatusLineInput } from '@shared/agent'
import type { PermissionMode, StatusSegmentId } from '@shared/models'
import type { ChatItem } from './chatReducer'
import { MODE_OPTIONS } from './permissions'
import { toolDiff } from './toolView'

export type StatusContext = {
  projectName: string
  branch: string | null
  model?: string
  contextPct?: number
  contextWindow?: number
  /** Context in use (latest main-loop prompt); falls back to `tokens`. */
  contextTokens?: number
  tokens: number
  costUsd: number
  /** Last turn. */
  durationMs?: number
  /** Since the panel's session started (what the CLI's statusLine calls total_duration_ms). */
  sessionDurationMs?: number
  linesAdded?: number
  linesRemoved?: number
  version?: string
  rateLimits?: RateLimits
  mode?: PermissionMode
}

export const SEGMENT_LABELS: Record<StatusSegmentId, string> = {
  project: 'projeto',
  branch: 'branch',
  model: 'modelo',
  context: 'contexto %',
  tokens: 'tokens',
  duration: 'duração',
  mode: 'modo',
  customScript: 'script do ~/.claude (statusLine)',
}

export const formatTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

/** "claude-opus-5[1m]" → "Opus 5 (1M context)", "claude-haiku-4-5-20251001" → "Haiku 4.5". */
export function modelLabel(id: string): string {
  const oneM = /\[1m\]$/i.test(id)
  const parts = id
    .replace(/\[1m\]$/i, '')
    .replace(/^claude-/, '')
    .split('-')
    .filter((p) => !/^\d{8}$/.test(p))
  const family = parts.find((p) => /^[a-z]+$/i.test(p))
  if (!family) return id
  const version = parts.filter((p) => /^\d+$/.test(p)).join('.')
  const name = `${family[0]!.toUpperCase()}${family.slice(1)}${version ? ` ${version}` : ''}`
  return oneM ? `${name} (1M context)` : name
}

/** Lines added/removed by the chat's successful Edit/MultiEdit/Write calls. */
export function lineStats(items: ChatItem[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const item of items) {
    if (item.type !== 'tool' || item.output === undefined || item.isError) continue
    for (const line of toolDiff(item.name, item.input)?.lines ?? []) {
      if (line.kind === 'add') added++
      else if (line.kind === 'del') removed++
    }
  }
  return { added, removed }
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
      case 'duration':
        return ctx.durationMs === undefined ? null : formatDuration(ctx.durationMs)
      case 'mode':
        return ctx.mode ? (MODE_OPTIONS.find((m) => m.value === ctx.mode)?.label ?? ctx.mode) : null
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
  const inUse = ctx.contextTokens ?? ctx.tokens
  const hasRates = Boolean(ctx.rateLimits?.five_hour || ctx.rateLimits?.seven_day)
  return {
    session_id: ctx.sessionId ?? '',
    cwd: ctx.cwd,
    model: { id: ctx.model ?? '', display_name: ctx.model ? modelLabel(ctx.model) : '' },
    workspace: { current_dir: ctx.cwd, project_dir: ctx.cwd },
    ...(ctx.version ? { version: ctx.version } : {}),
    cost: {
      total_cost_usd: ctx.costUsd,
      total_duration_ms: ctx.sessionDurationMs ?? ctx.durationMs ?? 0,
      total_lines_added: ctx.linesAdded ?? 0,
      total_lines_removed: ctx.linesRemoved ?? 0,
    },
    ...(ctx.contextPct !== undefined
      ? { context_window: { context_window_size: ctx.contextWindow ?? 0, used_percentage: ctx.contextPct, total_input_tokens: inUse } }
      : {}),
    exceeds_200k_tokens: (ctx.contextWindow ?? 0) > 200_000,
    ...(hasRates ? { rate_limits: ctx.rateLimits! } : {}),
  }
}
