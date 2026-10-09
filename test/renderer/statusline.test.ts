import { describe, expect, it } from 'vitest'
import { buildSegments, buildStatusLineInput, formatDuration, formatTokens, lineStats, modelLabel } from '@renderer/agent/statusline'

const ctx = { projectName: 'api', branch: 'dev', model: 'opus', contextPct: 29, tokens: 288_000, costUsd: 0.4213, durationMs: 73_000, mode: 'plan' as const }

describe('formatters', () => {
  it('formats duration and tokens', () => {
    expect(formatDuration(73_000)).toBe('1m13s')
    expect(formatDuration(900)).toBe('0.9s')
    expect(formatTokens(288_000)).toBe('288k')
    expect(formatTokens(950)).toBe('950')
  })
})

describe('modelLabel', () => {
  it('turns model ids into the CLI display names', () => {
    expect(modelLabel('claude-opus-5[1m]')).toBe('Opus 5 (1M context)')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(modelLabel('123')).toBe('123')
  })
})

describe('buildSegments', () => {
  it('renders the chosen segments in order and skips missing data', () => {
    expect(buildSegments(['project', 'branch', 'model', 'context', 'duration', 'mode', 'tokens'], ctx).map((s) => s.text)).toEqual([
      'api', 'dev', 'opus', 'contexto 29%', '1m13s', 'plan mode on', '288k tokens',
    ])
    expect(buildSegments(['effort'], ctx).map((s) => s.text)).toEqual(['esforço auto'])
    expect(buildSegments(['effort'], { ...ctx, effort: 'xhigh' }).map((s) => s.text)).toEqual(['esforço muito alto'])
    expect(buildSegments(['branch', 'context', 'customScript'], { ...ctx, branch: null, contextPct: undefined }).map((s) => s.id)).toEqual([])
  })
})

describe('lineStats', () => {
  it('counts lines of successful edits and writes only', () => {
    const items = [
      { type: 'tool' as const, id: 'a', name: 'Edit', input: { file_path: '/p/a.ts', old_string: 'x\ny', new_string: 'x\nz\nw' }, output: 'ok', isError: false },
      { type: 'tool' as const, id: 'b', name: 'Write', input: { file_path: '/p/b.ts', content: '1\n2\n' }, output: 'ok', isError: false },
      { type: 'tool' as const, id: 'c', name: 'Edit', input: { file_path: '/p/c.ts', old_string: 'q', new_string: 'r' }, output: 'boom', isError: true },
      { type: 'tool' as const, id: 'd', name: 'Edit', input: { file_path: '/p/d.ts', old_string: 'q', new_string: 'r' } },
    ]
    expect(lineStats(items)).toEqual({ added: 4, removed: 1 })
  })
})

describe('buildStatusLineInput', () => {
  it('maps to the Claude Code statusLine JSON shape', () => {
    expect(
      buildStatusLineInput({
        ...ctx,
        model: 'claude-opus-5[1m]',
        contextWindow: 1_000_000,
        contextTokens: 452_000,
        sessionDurationMs: 3_600_000,
        linesAdded: 12,
        linesRemoved: 3,
        version: '2.1.0',
        effort: 'low',
        rateLimits: { five_hour: { used_percentage: 97, resets_at: 1_900_000_000 } },
        sessionId: 's1',
        cwd: '/g/api',
      }),
    ).toEqual({
      session_id: 's1',
      cwd: '/g/api',
      model: { id: 'claude-opus-5[1m]', display_name: 'Opus 5 (1M context)' },
      workspace: { current_dir: '/g/api', project_dir: '/g/api' },
      version: '2.1.0',
      effort: { level: 'low' },
      cost: { total_cost_usd: 0.4213, total_duration_ms: 3_600_000, total_lines_added: 12, total_lines_removed: 3 },
      context_window: { context_window_size: 1_000_000, used_percentage: 29, total_input_tokens: 452_000 },
      exceeds_200k_tokens: true, // the 1M window, like the CLI's "200k+" flag
      rate_limits: { five_hour: { used_percentage: 97, resets_at: 1_900_000_000 } },
    })
  })
  it('omits what it does not know', () => {
    const input = buildStatusLineInput({ projectName: 'api', branch: null, tokens: 0, costUsd: 0, cwd: '/g/api' })
    expect(input).toEqual({
      session_id: '',
      cwd: '/g/api',
      model: { id: '', display_name: '' },
      workspace: { current_dir: '/g/api', project_dir: '/g/api' },
      cost: { total_cost_usd: 0, total_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
      exceeds_200k_tokens: false,
    })
  })
})
