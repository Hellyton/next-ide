import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AgentSession } from '../../src/main/agent/AgentSession'
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

  it('provides a scripted session list and history', async () => {
    expect((await fakeSessions.list('/p'))[0]).toMatchObject({ sessionId: 'fake-old', title: 'Sessão antiga de teste' })
    expect(await fakeSessions.history('/p', 'fake-old')).toHaveLength(2)
  })
})
