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

  it('accumulates cost across turns, keeps last stats, pushes users, thinking and errors', () => {
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
      stats(0.25),
      { kind: 'error', message: 'boom' },
    ])
    expect(s.totalCostUsd).toBeCloseTo(0.75)
    expect(s.stats?.costUsd).toBe(0.25)
    expect(s.items.map((i) => i.type)).toEqual(['user', 'thinking', 'error'])
  })
})
