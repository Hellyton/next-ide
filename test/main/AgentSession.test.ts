import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'
import { AgentSession, type QueryFn, type QueryLike, type QueryOptions, type UserMessageLike } from '../../src/main/agent/AgentSession'

const tick = () => new Promise((r) => setTimeout(r, 0))
const INIT = { type: 'system', subtype: 'init', session_id: 'sess-9', model: 'opus', cwd: '/p', permissionMode: 'default', slash_commands: [] }
const RESULT = { type: 'result', subtype: 'success', is_error: false, usage: {}, total_cost_usd: 0.1, duration_ms: 5, modelUsage: {} }
const STREAM_START = [
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm' } } },
  { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
]
const delta = (text: string) => ({
  type: 'stream_event',
  parent_tool_use_id: null,
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
})

function fake() {
  const out = new AsyncQueue<unknown>()
  const calls: Array<{ options: QueryOptions }> = []
  const received: UserMessageLike[] = []
  const q: QueryLike = {
    [Symbol.asyncIterator]: () => out[Symbol.asyncIterator](),
    interrupt: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    supportedCommands: async () => [{ name: 'compact', description: 'Compacta', argumentHint: '' }],
    supportedModels: async () => [{ value: 'opus', displayName: 'Opus', description: '' }],
    close: vi.fn(() => out.end()),
  }
  const fn: QueryFn = ({ prompt, options }) => {
    calls.push({ options })
    void (async () => {
      for await (const m of prompt) received.push(m)
    })()
    return q
  }
  return { fn, out, q, calls, received }
}

function session(fn: QueryFn, over: Partial<ConstructorParameters<typeof AgentSession>[0]> = {}) {
  const events: AgentEvent[] = []
  let n = 0
  const s = new AgentSession(
    { cwd: '/p', permissionMode: 'default', ...over },
    { queryFn: fn, emit: (e) => events.push(e), newId: () => `id${++n}`, claudePath: '/bin/claude' },
  )
  return { s, events }
}

describe('AgentSession', () => {
  it('starts lazily on first send and reuses the query', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    expect(f.calls).toHaveLength(0)
    s.send('oi')
    s.send('de novo')
    await tick()
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.options).toMatchObject({ cwd: '/p', permissionMode: 'default', includePartialMessages: true, pathToClaudeCodeExecutable: '/bin/claude', settingSources: ['user', 'project', 'local'] })
    expect(f.received.map((m) => m.message.content)).toEqual([[{ type: 'text', text: 'oi' }], [{ type: 'text', text: 'de novo' }]])
    expect(events.slice(0, 3)).toEqual([{ kind: 'query-start' }, { kind: 'user', id: 'id1', text: 'oi', images: 0 }, { kind: 'status', state: 'running' }])
  })

  it('sends images before text as base64 blocks', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('veja', [{ name: 'a.png', mediaType: 'image/png', data: 'AAAA' }])
    await tick()
    expect(f.received[0]!.message.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'veja' },
    ])
  })

  it('emits normalized events and goes idle after the result', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    f.out.push(INIT)
    f.out.push(RESULT)
    await tick()
    expect(events.some((e) => e.kind === 'init')).toBe(true)
    expect(events.at(-1)).toEqual({ kind: 'status', state: 'idle' })
    expect(s.currentState).toBe('idle')
  })

  it('asks for permission, resolves allow-always with suggestions and returns to running', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('apague')
    const decision = f.calls[0]!.options.canUseTool('Bash', { command: 'rm x' }, { signal: new AbortController().signal, suggestions: [{ type: 'addRules' }], title: 'Rodar rm?' })
    expect(events).toContainEqual({ kind: 'permission-request', requestId: 'id2', toolName: 'Bash', input: { command: 'rm x' }, canAlwaysAllow: true, title: 'Rodar rm?' })
    expect(s.currentState).toBe('awaiting_permission')
    s.respondPermission('id2', 'allow-always')
    await expect(decision).resolves.toEqual({ behavior: 'allow', updatedInput: { command: 'rm x' }, updatedPermissions: [{ type: 'addRules' }] })
    expect(events).toContainEqual({ kind: 'permission-resolved', requestId: 'id2', decision: 'allow-always' })
    expect(s.currentState).toBe('running')
  })

  it('denies, and cancels when the SDK aborts the request', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('x')
    const denied = f.calls[0]!.options.canUseTool('Write', {}, { signal: new AbortController().signal })
    s.respondPermission('id2', 'deny')
    await expect(denied).resolves.toMatchObject({ behavior: 'deny' })
    const ac = new AbortController()
    const cancelled = f.calls[0]!.options.canUseTool('Write', {}, { signal: ac.signal })
    ac.abort()
    await expect(cancelled).resolves.toMatchObject({ behavior: 'deny' })
    expect(events).toContainEqual({ kind: 'permission-resolved', requestId: 'id3', decision: 'cancelled' })
  })

  it('applies model and mode before start via options, after start via the query', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    await s.setModel('sonnet')
    await s.setMode('plan')
    s.send('oi')
    expect(f.calls[0]!.options).toMatchObject({ model: 'sonnet', permissionMode: 'plan' })
    await s.setModel('opus')
    expect(f.q.setModel).toHaveBeenCalledWith('opus')
    expect(events).toContainEqual({ kind: 'model', model: 'opus' })
    expect(events).toContainEqual({ kind: 'mode', permissionMode: 'plan' })
  })

  it('lists commands and models, starting the query if needed', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await expect(s.commands()).resolves.toEqual([{ name: 'compact', description: 'Compacta', argumentHint: '' }])
    await expect(s.models()).resolves.toEqual([{ value: 'opus', displayName: 'Opus', description: '' }])
    expect(f.calls).toHaveLength(1)
  })

  it('close cancels pending permissions, closes the query and ignores later sends', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('x')
    const p = f.calls[0]!.options.canUseTool('Bash', {}, { signal: new AbortController().signal })
    s.close()
    await expect(p).resolves.toMatchObject({ behavior: 'deny' })
    expect(f.q.close).toHaveBeenCalled()
    expect(s.currentState).toBe('exited')
    s.send('depois')
    expect(f.calls).toHaveLength(1)
  })

  it('reports stream errors and resumes the last session on the next send', async () => {
    const calls: QueryOptions[] = []
    let first = true
    const fn: QueryFn = ({ options }) => {
      calls.push(options)
      const crash = first
      first = false
      const gen = (async function* () {
        yield INIT
        if (crash) throw new Error('claude exited')
      })()
      return Object.assign(gen, {
        interrupt: async () => undefined,
        setModel: async () => undefined,
        setPermissionMode: async () => undefined,
        supportedCommands: async () => [],
        supportedModels: async () => [],
        close: () => undefined,
      })
    }
    const { s, events } = session(fn)
    s.send('oi')
    await tick()
    await tick()
    expect(events).toContainEqual({ kind: 'error', message: 'claude exited' })
    expect(s.currentState).toBe('error')
    s.send('de novo')
    expect(calls[1]).toMatchObject({ resume: 'sess-9' })
    // Once per query, including the resume after a crash.
    expect(events.filter((e) => e.kind === 'query-start')).toHaveLength(2)
  })

  it('emits query-start exactly once per query, not per send', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    s.send('de novo')
    await tick()
    expect(events.filter((e) => e.kind === 'query-start')).toHaveLength(1)
    expect(events[0]).toEqual({ kind: 'query-start' })
  })

  it('does not emit after close even if messages were buffered', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('x')
    f.out.push(INIT)
    s.close()
    await tick()
    const exitedIndex = events.findIndex((e) => e.kind === 'status' && e.state === 'exited')
    expect(exitedIndex).toBeGreaterThanOrEqual(0)
    expect(events.slice(exitedIndex + 1)).toEqual([])
  })

  it('resyncs the busy counter from queued_turn_count when queued sends coalesce', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('a')
    s.send('b')
    f.out.push({ ...RESULT, queued_turn_count: 0 })
    await tick()
    expect(s.currentState).toBe('idle')
  })

  it('keeps decrementing per result when queued_turn_count is absent', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('a')
    s.send('b')
    f.out.push(RESULT)
    await tick()
    expect(s.currentState).toBe('running')
    f.out.push(RESULT)
    await tick()
    expect(s.currentState).toBe('idle')
  })

  it('always passes allowDangerouslySkipPermissions, so bypass can be selected mid-session', async () => {
    // The SDK requires this flag only to PERMIT bypassPermissions, not to enable it: it must be
    // present on every start (not only when starting in bypass) or a later switch is rejected.
    const plain = fake()
    session(plain.fn).s.send('oi')
    expect(plain.calls[0]!.options.allowDangerouslySkipPermissions).toBe(true)
    const bypass = fake()
    const { s } = session(bypass.fn)
    await s.setMode('bypassPermissions')
    s.send('oi')
    expect(bypass.calls[0]!.options).toMatchObject({ permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
  })

  it('keeps the previous mode and emits nothing when setPermissionMode rejects', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    vi.mocked(f.q.setPermissionMode).mockRejectedValueOnce(new Error('nope'))
    await expect(s.setMode('plan')).rejects.toThrow('nope')
    expect(events.some((e) => e.kind === 'mode')).toBe(false)
    f.out.end()
    await tick()
    s.send('de novo')
    expect(f.calls[1]!.options.permissionMode).toBe('default')
  })

  it('keeps the previous model and emits nothing when setModel rejects', async () => {
    const f = fake()
    const { s, events } = session(f.fn, { model: 'opus' })
    s.send('oi')
    vi.mocked(f.q.setModel).mockRejectedValueOnce(new Error('nope'))
    await expect(s.setModel('sonnet')).rejects.toThrow('nope')
    expect(events.some((e) => e.kind === 'model')).toBe(false)
    f.out.end()
    await tick()
    s.send('de novo')
    expect(f.calls[1]!.options.model).toBe('opus')
  })

  it('coalesces text deltas in the batch window and flushes them before the next event', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    for (const m of [...STREAM_START, delta('a'), delta('b'), delta('c')]) f.out.push(m)
    await tick()
    expect(events.filter((e) => e.kind === 'text-delta')).toEqual([])
    f.out.push({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm', content: [{ type: 'text', text: 'abc' }] } })
    await tick()
    expect(events.filter((e) => e.kind === 'text-delta' || e.kind === 'text')).toEqual([
      { kind: 'text-delta', key: 'm:0', text: 'abc' },
      { kind: 'text', key: 'm:0', text: 'abc' },
    ])
  })

  it('flushes pending deltas when the batch window elapses', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    for (const m of [...STREAM_START, delta('a'), delta('b')]) f.out.push(m)
    await new Promise((r) => setTimeout(r, 40))
    expect(events.filter((e) => e.kind === 'text-delta')).toEqual([{ kind: 'text-delta', key: 'm:0', text: 'ab' }])
  })

  it('flushes pending deltas before reporting exited on close', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    for (const m of [...STREAM_START, delta('a')]) f.out.push(m)
    await tick()
    s.close()
    const kinds = events.map((e) => (e.kind === 'status' ? `status:${e.state}` : e.kind))
    expect(kinds.slice(-2)).toEqual(['text-delta', 'status:exited'])
  })

  it('wakes from idle when a queued turn starts running without a queued_turn_count bump', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('a')
    f.out.push({ ...RESULT, queued_turn_count: 0 })
    await tick()
    expect(s.currentState).toBe('idle')
    // The CLI hadn't read a second queued send yet when it produced that result; the next
    // turn's stream now starts even though the panel is showing idle.
    f.out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm2' } } })
    await tick()
    expect(s.currentState).toBe('running')
    f.out.push({ ...RESULT, queued_turn_count: 0 })
    await tick()
    expect(s.currentState).toBe('idle')
  })

  it('does not wake from idle for a subagent message', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('a')
    f.out.push({ ...RESULT, queued_turn_count: 0 })
    await tick()
    expect(s.currentState).toBe('idle')
    f.out.push({
      type: 'assistant',
      parent_tool_use_id: 'task1',
      message: { id: 'sub1', content: [{ type: 'text', text: 'from subagent' }] },
    })
    await tick()
    expect(s.currentState).toBe('idle')
  })

  it('wakes from idle on a main-loop assistant message even without a preceding stream_event', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('a')
    f.out.push({ ...RESULT, queued_turn_count: 0 })
    await tick()
    expect(s.currentState).toBe('idle')
    f.out.push({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm3', content: [{ type: 'text', text: 'oi' }] } })
    await tick()
    expect(s.currentState).toBe('running')
  })

  it('removes the abort listener once the permission is answered', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('x')
    const ac = new AbortController()
    const spy = vi.spyOn(ac.signal, 'removeEventListener')
    const decision = f.calls[0]!.options.canUseTool('Bash', {}, { signal: ac.signal })
    s.respondPermission('id2', 'allow')
    await expect(decision).resolves.toMatchObject({ behavior: 'allow' })
    expect(spy).toHaveBeenCalledWith('abort', expect.any(Function))
  })
  it('passes effort on start and applies it live through applyFlagSettings', async () => {
    const f = fake()
    const apply = vi.fn(async () => undefined)
    f.q.applyFlagSettings = apply
    const { s, events } = session(f.fn, { effort: 'high' })
    s.start()
    expect(f.calls[0]!.options.effort).toBe('high')
    await s.setEffort('low')
    expect(apply).toHaveBeenCalledWith({ effortLevel: 'low' })
    expect(events).toContainEqual({ kind: 'effort', effort: 'low' })
    await s.setEffort(null)
    expect(apply).toHaveBeenLastCalledWith({ effortLevel: null })
  })

  it('keeps effort for the next query when set before start', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await s.setEffort('max')
    s.start()
    expect(f.calls[0]!.options.effort).toBe('max')
  })

  it('rejects and keeps the previous effort when applyFlagSettings fails', async () => {
    const f = fake()
    f.q.applyFlagSettings = async () => {
      throw new Error('nope')
    }
    const { s, events } = session(f.fn, { effort: 'medium' })
    s.start()
    await expect(s.setEffort('max')).rejects.toThrow('nope')
    expect(events.some((e) => e.kind === 'effort')).toBe(false)
  })

  it('reports context usage, starting the query if needed', async () => {
    const f = fake()
    f.q.getContextUsage = async () => ({ model: 'opus', totalTokens: 10, maxTokens: 100, percentage: 10, categories: [], memoryFiles: [] })
    const { s } = session(f.fn)
    await expect(s.contextUsage()).resolves.toEqual({
      ok: true,
      value: { model: 'opus', totalTokens: 10, maxTokens: 100, percentage: 10, categories: [], memoryFiles: [] },
    })
    expect(f.calls).toHaveLength(1)
  })

  it('context usage degrades when unsupported or failing', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await expect(s.contextUsage()).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
    f.q.getContextUsage = async () => {
      throw new Error('boom')
    }
    await expect(s.contextUsage()).resolves.toEqual({ ok: false, message: 'boom' })
  })

  describe('btw', () => {
    it('answers from the side question without emitting chat events or queuing a turn', async () => {
      const f = fake()
      const ask = vi.fn(async (q: string) => ({ response: `r: ${q}` }))
      f.q.askSideQuestion = ask
      const { s, events } = session(f.fn)
      await expect(s.btw('qual arquivo?')).resolves.toEqual({ ok: true, text: 'r: qual arquivo?' })
      expect(ask).toHaveBeenCalledWith('qual arquivo?', { signal: expect.any(AbortSignal) })
      expect(f.received).toHaveLength(0)
      expect(events.filter((e) => e.kind === 'user')).toHaveLength(0)
    })

    it('reports unsupported binaries, null answers and errors', async () => {
      const f = fake()
      const { s } = session(f.fn)
      await expect(s.btw('x')).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
      f.q.askSideQuestion = async () => null
      await expect(s.btw('x')).resolves.toEqual({ ok: false, message: 'Sem resposta.' })
      f.q.askSideQuestion = async () => {
        throw new Error('boom')
      }
      await expect(s.btw('x')).resolves.toEqual({ ok: false, message: 'boom' })
    })

    it('cancels the in-flight question on cancelBtw, a newer question, or close', async () => {
      const f = fake()
      const signals: AbortSignal[] = []
      f.q.askSideQuestion = (_q, opts) =>
        new Promise((_resolve, reject) => {
          signals.push(opts!.signal!)
          opts!.signal!.addEventListener('abort', () => reject(new Error('aborted')))
        })
      const { s } = session(f.fn)
      const first = s.btw('a')
      const second = s.btw('b')
      await expect(first).resolves.toEqual({ ok: false, message: 'Cancelado.' })
      s.cancelBtw()
      await expect(second).resolves.toEqual({ ok: false, message: 'Cancelado.' })
      const third = s.btw('c')
      s.close()
      await expect(third).resolves.toEqual({ ok: false, message: 'Cancelado.' })
      expect(signals.every((sig) => sig.aborted)).toBe(true)
      await expect(s.btw('d')).resolves.toEqual({ ok: false, message: 'Sessão encerrada.' })
    })
  })
})
