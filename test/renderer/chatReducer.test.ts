import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { initialChat, pendingPermission, reduceAll, reduceChat } from '@renderer/agent/chatReducer'

describe('reduceChat', () => {
  it('tracks status, init, mode and model', () => {
    const s = reduceAll([
      { kind: 'status', state: 'running' },
      { kind: 'init', sessionId: 's1', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: ['compact'] },
      { kind: 'mode', permissionMode: 'plan' },
      { kind: 'model', model: 'sonnet' },
    ])
    expect(s).toMatchObject({ state: 'running', sessionId: 's1', model: 'sonnet', permissionMode: 'plan', slashCommands: ['compact'] })
  })

  it('accumulates text deltas and lets the final text win', () => {
    const s = reduceAll([
      { kind: 'text-delta', key: 'm:1', text: 'hel' },
      { kind: 'text-delta', key: 'm:1', text: 'lo' },
    ])
    expect(s.items).toEqual([{ type: 'text', key: 'm:1', text: 'hello', final: false }])
    const f = reduceChat(s, { kind: 'text', key: 'm:1', text: 'hello!' })
    expect(f.items).toEqual([{ type: 'text', key: 'm:1', text: 'hello!', final: true }])
    expect(reduceChat(f, { kind: 'text-delta', key: 'm:1', text: 'late' }).items[0]).toMatchObject({ text: 'hello!' })
  })

  it('pushes a final text with no prior deltas and keeps parentToolUseId', () => {
    const s = reduceChat(initialChat, { kind: 'text', key: 'k', text: 'x', parentToolUseId: 'task' })
    expect(s.items).toEqual([{ type: 'text', key: 'k', text: 'x', final: true, parentToolUseId: 'task' }])
  })

  it('attaches tool results to their tool item and ignores unknown ids', () => {
    const s = reduceAll([
      { kind: 'tool-start', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool-result', id: 't1', output: 'a\nb', isError: false },
      { kind: 'tool-result', id: 'nope', output: 'x', isError: true },
    ])
    expect(s.items).toEqual([{ type: 'tool', id: 't1', name: 'Bash', input: { command: 'ls' }, output: 'a\nb', isError: false }])
  })

  it('tracks permission requests and their resolution', () => {
    const s = reduceAll([
      { kind: 'permission-request', requestId: 'r1', toolName: 'Bash', input: { command: 'rm x' }, canAlwaysAllow: true },
    ])
    expect(pendingPermission(s)?.requestId).toBe('r1')
    const r = reduceChat(s, { kind: 'permission-resolved', requestId: 'r1', decision: 'deny' })
    expect(pendingPermission(r)).toBeUndefined()
    expect(r.items[0]).toMatchObject({ type: 'permission', decision: 'deny' })
  })

  it('treats cost as cumulative per query, keeps last stats, pushes users, thinking and errors', () => {
    const stats = (costUsd: number): AgentEvent => ({
      kind: 'stats',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd,
      durationMs: 10,
    })
    const s = reduceAll([
      { kind: 'user', id: 'u1', text: 'oi', images: 1 },
      { kind: 'thinking', key: 'th', text: 'hmm' },
      { kind: 'thinking', key: 'th', text: 'hmm' },
      stats(0.5),
      stats(0.75),
      { kind: 'error', message: 'boom' },
    ])
    expect(s.totalCostUsd).toBeCloseTo(0.75)
    expect(s.stats?.costUsd).toBe(0.75)
    expect(s.items.map((i) => i.type)).toEqual(['user', 'thinking', 'error'])
  })

  it('folds the previous query total into the base on query-start, even when the new total is not lower', () => {
    const stats = (costUsd: number): AgentEvent => ({
      kind: 'stats',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd,
      durationMs: 10,
    })
    const s = reduceAll([stats(0.4), { kind: 'query-start' }, stats(0.55)])
    expect(s.totalCostUsd).toBeCloseTo(0.95)
    expect(s.lastQueryCostUsd).toBeCloseTo(0.55)
  })

  it('keeps two stats within the same query additive only to the base, not to each other', () => {
    const stats = (costUsd: number): AgentEvent => ({
      kind: 'stats',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd,
      durationMs: 10,
    })
    const s = reduceAll([stats(0.5), stats(0.75)])
    expect(s.totalCostUsd).toBeCloseTo(0.75)
  })

  it('carries a new-session action on errors, inferring it for missing conversations', () => {
    const s = reduceAll([
      { kind: 'error', message: 'Sessão anterior não encontrada.', action: 'new-session' },
      { kind: 'error', message: 'No conversation found with session ID: abc' },
      { kind: 'error', message: 'boom' },
    ])
    expect(s.items).toEqual([
      { type: 'error', id: 'err-0', message: 'Sessão anterior não encontrada.', action: 'new-session' },
      { type: 'error', id: 'err-1', message: 'No conversation found with session ID: abc', action: 'new-session' },
      { type: 'error', id: 'err-2', message: 'boom' },
    ])
  })
})
