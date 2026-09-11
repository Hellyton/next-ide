import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'
import { AgentSession, type QueryFn, type QueryLike, type QueryOptions, type UserMessageLike } from '../../src/main/agent/AgentSession'

const tick = () => new Promise((r) => setTimeout(r, 0))
const INIT = { type: 'system', subtype: 'init', session_id: 'sess-9', model: 'opus', cwd: '/p', permissionMode: 'default', slash_commands: [] }
const RESULT = { type: 'result', subtype: 'success', is_error: false, usage: {}, total_cost_usd: 0.1, duration_ms: 5, modelUsage: {} }

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
    expect(events.slice(0, 2)).toEqual([{ kind: 'user', id: 'id1', text: 'oi', images: 0 }, { kind: 'status', state: 'running' }])
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
})
