import { describe, expect, it } from 'vitest'
import { buildSegments, buildStatusLineInput, formatCost, formatDuration, formatTokens } from '@renderer/agent/statusline'

const ctx = { projectName: 'api', branch: 'dev', model: 'opus', contextPct: 29, tokens: 288_000, costUsd: 0.4213, durationMs: 73_000, mode: 'plan' as const, state: 'running' as const }

describe('formatters', () => {
  it('formats cost, duration and tokens', () => {
    expect(formatCost(0.4213)).toBe('$0.42')
    expect(formatCost(0)).toBe('$0.00')
    expect(formatDuration(73_000)).toBe('1m13s')
    expect(formatDuration(900)).toBe('0.9s')
    expect(formatTokens(288_000)).toBe('288k')
    expect(formatTokens(950)).toBe('950')
  })
})

describe('buildSegments', () => {
  it('renders the chosen segments in order and skips missing data', () => {
    expect(buildSegments(['project', 'branch', 'model', 'context', 'cost', 'duration', 'mode', 'state', 'tokens'], ctx).map((s) => s.text)).toEqual([
      'api', 'dev', 'opus', 'contexto 29%', '$0.42', '1m13s', 'Plano', 'rodando', '288k tokens',
    ])
    expect(buildSegments(['branch', 'context', 'customScript'], { ...ctx, branch: null, contextPct: undefined }).map((s) => s.id)).toEqual([])
  })
})

describe('buildStatusLineInput', () => {
  it('maps to the Claude Code statusLine JSON shape', () => {
    expect(buildStatusLineInput({ ...ctx, sessionId: 's1', cwd: '/g/api' })).toEqual({
      session_id: 's1',
      cwd: '/g/api',
      model: { id: 'opus', display_name: 'opus' },
      workspace: { current_dir: '/g/api', project_dir: '/g/api' },
      cost: { total_cost_usd: 0.4213, total_duration_ms: 73_000 },
      context_window: { context_window_size: 0, used_percentage: 29, total_input_tokens: 288_000 },
    })
  })
})
