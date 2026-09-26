import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { StreamNormalizer, flattenToolOutput, historyToEvents, parseContextUsage, parseSessionUsage } from '../../src/main/agent/normalize'

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

  it('emits stats with cost, duration and context percentage from the last assistant call', () => {
    // Result usage sums both API calls (18 + 34522 + 8306); the context in use is the
    // last assistant message's prompt: 3 + 21000 + 500 = 21503 / 200000 → 11%.
    expect(events.at(-1)).toEqual({
      kind: 'stats',
      usage: { inputTokens: 18, outputTokens: 212, cacheReadTokens: 34522, cacheCreationTokens: 8306 },
      costUsd: 0.0221112,
      durationMs: 3242,
      contextWindow: 200000,
      contextPct: 11,
      contextTokens: 21503,
    })
  })
})

describe('StreamNormalizer (statusline data)', () => {
  it('passes the Claude Code version from init', () => {
    const [init] = run([{ type: 'system', subtype: 'init', session_id: 's', model: 'm', cwd: '/p', claude_code_version: '2.1.3' }])
    expect(init).toMatchObject({ kind: 'init', version: '2.1.3' })
  })

  it('maps five-hour and seven-day rate limits to percentages and epoch seconds', () => {
    expect(run([{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.42, resetsAt: 1_900_000_000 } }])).toEqual([
      { kind: 'rate-limit', window: 'five_hour', usedPct: 42, resetsAt: 1_900_000_000 },
    ])
    expect(run([{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 16, resetsAt: 1_900_000_000_000 } }])).toEqual([
      { kind: 'rate-limit', window: 'seven_day', usedPct: 16, resetsAt: 1_900_000_000 },
    ])
  })

  it('ignores other rate limit windows and events without utilization', () => {
    expect(run([{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'overage', utilization: 0.1 } }])).toEqual([])
    expect(run([{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour' } }])).toEqual([])
  })
})

describe('StreamNormalizer (context usage)', () => {
  const RESULT = { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 999999 }, total_cost_usd: 0, duration_ms: 1, modelUsage: { m: { contextWindow: 1000 } } }
  const assistant = (usage: Record<string, number>, parent: string | null = null) => ({
    type: 'assistant',
    parent_tool_use_id: parent,
    message: { id: `a${Math.random()}`, content: [], usage },
  })

  it('ignores subagent usage and omits the percentage when no main assistant usage is known', () => {
    const none = run([assistant({ input_tokens: 500 }, 'task_1'), RESULT]).at(-1)
    expect(none).toMatchObject({ kind: 'stats', contextWindow: 1000 })
    expect(none).not.toHaveProperty('contextPct')
    const main = run([
      assistant({ input_tokens: 100, cache_read_input_tokens: 150, cache_creation_input_tokens: 0 }),
      assistant({ input_tokens: 900 }, 'task_1'),
      RESULT,
    ]).at(-1)
    expect(main).toMatchObject({ contextWindow: 1000, contextPct: 25 })
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

  it('keeps interleaved root and subagent streams apart', () => {
    const out = run([
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'mA' } } },
      { type: 'stream_event', parent_tool_use_id: 't1', event: { type: 'message_start', message: { id: 'mS' } } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { type: 'stream_event', parent_tool_use_id: 't1', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'root ' } } },
      { type: 'stream_event', parent_tool_use_id: 't1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'sub ' } } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'text' } } },
      { type: 'stream_event', parent_tool_use_id: 't1', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'text' } } },
      { type: 'assistant', parent_tool_use_id: null, message: { id: 'mA', content: [{ type: 'text', text: 'root text' }] } },
      { type: 'assistant', parent_tool_use_id: 't1', message: { id: 'mS', content: [{ type: 'text', text: 'sub text' }] } },
    ])
    const deltas = out.filter((e) => e.kind === 'text-delta')
    const texts = out.filter((e) => e.kind === 'text')

    const rootDeltas = deltas.filter((d) => !d.parentToolUseId)
    const subDeltas = deltas.filter((d) => d.parentToolUseId === 't1')

    expect(rootDeltas.map((d) => d.key)).toEqual(['mA:0', 'mA:0'])
    expect(rootDeltas.map((d) => d.text)).toEqual(['root ', 'text'])
    expect(subDeltas.map((d) => d.key)).toEqual(['mS:0', 'mS:0'])
    expect(subDeltas.map((d) => d.text)).toEqual(['sub ', 'text'])

    expect(texts).toEqual([
      { kind: 'text', key: 'mA:0', text: 'root text' },
      { kind: 'text', key: 'mS:0', text: 'sub text', parentToolUseId: 't1' },
    ])
  })

  it('pairs two text blocks of the same message in order', () => {
    const out = run([
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm2' } } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } } },
      { type: 'assistant', parent_tool_use_id: null, message: { id: 'm2', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } },
    ])
    const texts = out.filter((e) => e.kind === 'text')
    expect(texts.map((t) => t.key)).toEqual(['m2:0', 'm2:2'])
  })
})

describe('parseSessionUsage', () => {
  it('maps session totals and rate limits (ISO resets -> epoch seconds)', () => {
    expect(
      parseSessionUsage({
        session: { total_cost_usd: 1.5, total_duration_ms: 53_700_000, total_lines_added: 28_129, total_lines_removed: 651 },
        rate_limits: { five_hour: { utilization: 0, resets_at: '2100-01-01T00:00:00.000Z' }, seven_day: { utilization: 17.44, resets_at: null } },
      }),
    ).toEqual({
      totalCostUsd: 1.5,
      totalDurationMs: 53_700_000,
      totalLinesAdded: 28_129,
      totalLinesRemoved: 651,
      rateLimits: { five_hour: { used_percentage: 0, resets_at: 4_102_444_800 }, seven_day: { used_percentage: 17.4 } },
    })
  })
  it('returns empty limits when the plan has none, and null for a junk response', () => {
    expect(parseSessionUsage({ session: {}, rate_limits: null })).toEqual({
      totalCostUsd: 0, totalDurationMs: 0, totalLinesAdded: 0, totalLinesRemoved: 0, rateLimits: {},
    })
    expect(parseSessionUsage('nope')).toBeNull()
  })
})

describe('parseContextUsage', () => {
  it('keeps the fields the modal shows and drops malformed entries', () => {
    expect(
      parseContextUsage({
        model: 'opus',
        totalTokens: 18000,
        maxTokens: 200000,
        percentage: 9,
        categories: [
          { name: 'Messages', tokens: 1000, color: 'blue', kind: 'used' },
          { name: 'bad', tokens: 'x' },
        ],
        memoryFiles: [{ path: '/p/CLAUDE.md', type: 'Project', tokens: 300 }],
        gridRows: [],
      }),
    ).toEqual({
      model: 'opus',
      totalTokens: 18000,
      maxTokens: 200000,
      percentage: 9,
      categories: [{ name: 'Messages', tokens: 1000, color: 'blue', kind: 'used' }],
      memoryFiles: [{ path: '/p/CLAUDE.md', tokens: 300 }],
    })
    expect(parseContextUsage(null)).toBeNull()
    expect(parseContextUsage({ totalTokens: 'x' })).toBeNull()
    expect(parseContextUsage({ totalTokens: 0, maxTokens: 0 })).toBeNull()
    expect(parseContextUsage({ totalTokens: 0, maxTokens: -1 })).toBeNull()
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
      { type: 'user', uuid: 'u4', parent_tool_use_id: null, message: { role: 'user', content: '<div class="x">colado</div> isso quebra?' } },
      { type: 'user', uuid: 'u5', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: '<local-command-stdout>ok</local-command-stdout>' }] } },
      { type: 'user', uuid: 'u6', parent_tool_use_id: null, message: { role: 'user', content: '<system-reminder>x</system-reminder>' } },
    ])
    expect(out.map((e) => e.kind)).toEqual(['user', 'tool-start', 'tool-result', 'text', 'user', 'user'])
    expect(out[0]).toEqual({ kind: 'user', id: 'u1', text: 'leia o arquivo', images: 0 })
    expect(out[4]).toEqual({ kind: 'user', id: 'u3', text: 'veja', images: 1 })
    expect(out[5]).toEqual({ kind: 'user', id: 'u4', text: '<div class="x">colado</div> isso quebra?', images: 0 })
  })
})

describe('task messages', () => {
  it('turns task_started / task_progress / task_notification into task events', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu1', description: 'npm test', task_type: 'local_agent', subagent_type: 'Explore' })).toEqual([
      { kind: 'task-started', id: 't1', description: 'npm test', background: false, toolUseId: 'tu1', taskType: 'local_agent', subagentType: 'Explore' },
    ])
    expect(
      n.push({ type: 'system', subtype: 'task_progress', task_id: 't1', description: 'npm test', last_tool_name: 'Bash', usage: { total_tokens: 10, tool_uses: 2, duration_ms: 1500 } }),
    ).toEqual([{ kind: 'task-progress', id: 't1', description: 'npm test', lastToolName: 'Bash', totalTokens: 10, toolUses: 2, durationMs: 1500 }])
    expect(n.push({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'ok', output_file: '/x' })).toEqual([
      { kind: 'task-done', id: 't1', status: 'completed', summary: 'ok' },
    ])
  })
  it('task_started without taskType and subagentType produces no such keys', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'npm test' })).toEqual([
      { kind: 'task-started', id: 't1', description: 'npm test', background: false },
    ])
  })
  it('marks a task started with is_backgrounded: true as background', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', task_id: 't1', description: 'npm run build', is_backgrounded: true })).toEqual([
      { kind: 'task-started', id: 't1', description: 'npm run build', background: true },
    ])
  })
  it('drops malformed task messages', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', description: 'sem id' })).toEqual([])
    expect(n.push({ type: 'system', subtype: 'task_notification', task_id: 't', status: 'weird', summary: '' })).toEqual([])
  })

  describe('task_updated', () => {
    it('turns a completed/failed/killed patch.status into task-done (killed -> stopped)', () => {
      const n = new StreamNormalizer()
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'completed' } })).toEqual([
        { kind: 'task-done', id: 't1', status: 'completed', summary: '' },
      ])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'failed' } })).toEqual([
        { kind: 'task-done', id: 't1', status: 'failed', summary: '' },
      ])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'killed' } })).toEqual([
        { kind: 'task-done', id: 't1', status: 'stopped', summary: '' },
      ])
    })
    it('ignores other patch.status values, a missing status and malformed messages', () => {
      const n = new StreamNormalizer()
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'running' } })).toEqual([])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'pending' } })).toEqual([])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'paused' } })).toEqual([])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { description: 'sem status' } })).toEqual([])
      expect(n.push({ type: 'system', subtype: 'task_updated', patch: { status: 'completed' } })).toEqual([])
    })
    it('emits task-backgrounded when patch.is_backgrounded is true, before task-done when both are set', () => {
      const n = new StreamNormalizer()
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { is_backgrounded: true } })).toEqual([
        { kind: 'task-backgrounded', id: 't1' },
      ])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { is_backgrounded: true, status: 'completed' } })).toEqual([
        { kind: 'task-backgrounded', id: 't1' },
        { kind: 'task-done', id: 't1', status: 'completed', summary: '' },
      ])
    })
    it('does not emit task-backgrounded when patch.is_backgrounded is false or absent', () => {
      const n = new StreamNormalizer()
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { is_backgrounded: false, status: 'completed' } })).toEqual([
        { kind: 'task-done', id: 't1', status: 'completed', summary: '' },
      ])
      expect(n.push({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'failed' } })).toEqual([
        { kind: 'task-done', id: 't1', status: 'failed', summary: '' },
      ])
    })
  })
})
