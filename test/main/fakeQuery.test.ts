import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AgentSession, type QueryOptions, type UserMessageLike } from '../../src/main/agent/AgentSession'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'
import { fakeQuery, fakeSessions } from '../../src/main/agent/fakeQuery'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('fakeQuery', () => {
  it('echoes the prompt with streaming, stats and returns to idle', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('olá')
    await tick()
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['init', 'text-delta', 'text', 'stats']))
    expect(s.currentState).toBe('idle')
  })

  it('asks for permission when the prompt mentions "permissão"', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('teste de permissão')
    await tick()
    const req = events.find((e) => e.kind === 'permission-request')
    expect(req).toMatchObject({ toolName: 'Bash', input: { command: 'rm -rf dist' }, canAlwaysAllow: true })
    s.respondPermission(req!.kind === 'permission-request' ? req!.requestId : '', 'allow')
    await tick()
    expect(events).toContainEqual({ kind: 'tool-result', id: 'fake_tool_1', output: 'removido', isError: false })
  })

  it('emits an Edit tool call when the prompt mentions "editar"', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('editar arquivo')
    await tick()
    expect(events).toContainEqual({
      kind: 'tool-start',
      id: 'fake_edit_1',
      name: 'Edit',
      input: { file_path: '/tmp/exemplo.ts', old_string: 'const a = 1', new_string: 'const a = 2' },
    })
  })

  it('reports cumulative cost and the sends still queued on each result', async () => {
    const prompt = new AsyncQueue<UserMessageLike>()
    const msg = (text: string): UserMessageLike => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, parent_tool_use_id: null })
    prompt.push(msg('um'))
    prompt.push(msg('dois'))
    prompt.end()
    const options = { cwd: '/p', permissionMode: 'default', includePartialMessages: true, settingSources: [], abortController: new AbortController(), canUseTool: async () => ({ behavior: 'allow' }) } as unknown as QueryOptions
    const results: Array<Record<string, unknown>> = []
    for await (const m of fakeQuery({ prompt, options })) {
      if ((m as { type?: string }).type === 'result') results.push(m as Record<string, unknown>)
    }
    expect(results.map((r) => r.total_cost_usd)).toEqual([0.01, 0.02])
    expect(results.map((r) => r.queued_turn_count)).toEqual([1, 0])
  })

  it('supports rewindFiles for e2e', async () => {
    const q = fakeQuery({
      prompt: new AsyncQueue<UserMessageLike>(),
      options: {
        cwd: '/p',
        permissionMode: 'default',
        includePartialMessages: true,
        canUseTool: async () => ({ behavior: 'allow' }),
        settingSources: [],
        abortController: new AbortController(),
        enableFileCheckpointing: true,
      },
    })
    await expect(q.rewindFiles!('x', { dryRun: true })).resolves.toMatchObject({ canRewind: true, filesChanged: ['/p/src/app.ts'] })
    q.close()
  })

  it('provides a scripted session list and history', async () => {
    expect((await fakeSessions.list('/p'))[0]).toMatchObject({ sessionId: 'fake-old', title: 'Sessão antiga de teste' })
    expect(await fakeSessions.history('/p', 'fake-old')).toHaveLength(4)
  })

  it('forks and renames sessions for e2e', async () => {
    await expect(fakeSessions.fork('/p', 'fake-old', 'h2')).resolves.toBe('fake-fork')
    await expect(fakeSessions.rename('/p', 'fake-old', 'x')).resolves.toBeUndefined()
  })
})
