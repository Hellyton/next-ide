import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { StreamNormalizer, flattenToolOutput, historyToEvents } from '../../src/main/agent/normalize'

const fixture = readFileSync(join(__dirname, '../fixtures/stream-read.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as unknown)

function run(messages: unknown[]): AgentEvent[] {
  const n = new StreamNormalizer()
  return messages.flatMap((m) => n.push(m))
}

describe('StreamNormalizer (recorded stream)', () => {
  const events = run(fixture)

  it('emits init with session, model, cwd, mode and commands', () => {
    expect(events[0]).toEqual({
      kind: 'init',
      sessionId: 'sess-1',
      model: 'claude-haiku-4-5-20251001',
      cwd: '/tmp/fixture',
      permissionMode: 'default',
      slashCommands: ['compact', 'review'],
    })
  })

  it('streams text deltas under the same key as the final text', () => {
    const deltas = events.filter((e) => e.kind === 'text-delta')
    const finals = events.filter((e) => e.kind === 'text')
    expect(deltas.map((d) => d.kind === 'text-delta' && d.text)).toEqual(['hello ', 'next-ide'])
    expect(finals).toEqual([{ kind: 'text', key: 'msg_B:1', text: 'hello next-ide' }])
    expect(deltas.every((d) => d.kind === 'text-delta' && d.key === 'msg_B:1')).toBe(true)
  })

  it('maps tool use and tool result, skips empty thinking and unknown messages', () => {
    expect(events).toContainEqual({ kind: 'tool-start', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/fixture/hello.txt' } })
    expect(events).toContainEqual({ kind: 'tool-result', id: 'toolu_1', output: '1\thello next-ide\n2\t', isError: false })
    expect(events.some((e) => e.kind === 'thinking')).toBe(false)
  })

  it('emits stats with cost, duration and context percentage', () => {
    expect(events.at(-1)).toEqual({
      kind: 'stats',
      usage: { inputTokens: 18, outputTokens: 212, cacheReadTokens: 34522, cacheCreationTokens: 8306 },
      costUsd: 0.0221112,
      durationMs: 3242,
      contextWindow: 200000,
      contextPct: 21,
    })
  })
})

describe('StreamNormalizer (edge cases)', () => {
  it('emits non-empty thinking and passes parentToolUseId through', () => {
    const out = run([
      { type: 'assistant', parent_tool_use_id: 'task_1', message: { id: 'm', content: [{ type: 'thinking', thinking: 'plan' }, { type: 'text', text: 'hi' }] } },
    ])
    expect(out[0]).toMatchObject({ kind: 'thinking', text: 'plan' })
    expect(out[1]).toMatchObject({ kind: 'text', text: 'hi', parentToolUseId: 'task_1' })
  })

  it('emits an error after stats for failed results', () => {
    const out = run([{ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'], usage: {}, total_cost_usd: 0, duration_ms: 1 }])
    expect(out.map((e) => e.kind)).toEqual(['stats', 'error'])
    expect(out[1]).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('flattenToolOutput', () => {
  it('handles strings, text blocks and images', () => {
    expect(flattenToolOutput('x')).toBe('x')
    expect(flattenToolOutput([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n[imagem]\nb')
    expect(flattenToolOutput(undefined)).toBe('')
  })
})

describe('historyToEvents', () => {
  it('rebuilds user prompts, assistant text and tool results; hides meta user messages', () => {
    const out = historyToEvents([
      { type: 'user', uuid: 'u1', parent_tool_use_id: null, message: { role: 'user', content: 'leia o arquivo' } },
      { type: 'user', uuid: 'u0', parent_tool_use_id: null, message: { role: 'user', content: '<command-name>/clear</command-name>' } },
      { type: 'assistant', uuid: 'a1', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] } },
      { type: 'user', uuid: 'u2', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
      { type: 'assistant', uuid: 'a2', parent_tool_use_id: null, message: { id: 'm2', content: [{ type: 'text', text: 'pronto' }] } },
      { type: 'user', uuid: 'u3', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: 'veja' }, { type: 'image', source: {} }] } },
    ])
    expect(out.map((e) => e.kind)).toEqual(['user', 'tool-start', 'tool-result', 'text', 'user'])
    expect(out[0]).toEqual({ kind: 'user', id: 'u1', text: 'leia o arquivo', images: 0 })
    expect(out[4]).toEqual({ kind: 'user', id: 'u3', text: 'veja', images: 1 })
  })
})
