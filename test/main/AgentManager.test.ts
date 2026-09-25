import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AgentManager } from '../../src/main/agent/AgentManager'
import { fakeQuery } from '../../src/main/agent/fakeQuery'

const tick = () => new Promise((r) => setTimeout(r, 5))

function manager() {
  const events: Array<[string, AgentEvent]> = []
  const m = new AgentManager({ emit: (id, e) => events.push([id, e]), runtime: () => ({ queryFn: fakeQuery }) })
  return { m, events }
}

describe('AgentManager', () => {
  it('creates one session per panel and routes events by panel id', async () => {
    const { m, events } = manager()
    m.create('p1', { type: 'agent', projectPath: '/proj' })
    m.create('p1', { type: 'agent', projectPath: '/other' })
    m.get('p1').send('oi')
    await tick()
    expect(events.every(([id]) => id === 'p1')).toBe(true)
    expect(events.some(([, e]) => e.kind === 'text' && e.text === 'Você disse: oi')).toBe(true)
  })

  it('announces the session mode right away, so a fresh panel shows it', () => {
    const { m, events } = manager()
    m.create('p1', { type: 'agent', projectPath: '/proj', permissionMode: 'auto' })
    expect(events).toEqual([
      ['p1', { kind: 'mode', permissionMode: 'auto' }],
      ['p1', { kind: 'effort', effort: null }],
    ])
    m.create('p2', { type: 'agent', projectPath: '/proj' })
    expect(events.at(-1)).toEqual(['p2', { kind: 'effort', effort: null }])
  })

  it('drops an effort that is not a known level', () => {
    const { m, events } = manager()
    m.create('p1', { type: 'agent', projectPath: '/proj', effort: 'turbo' as never })
    expect(events.at(-1)).toEqual(['p1', { kind: 'effort', effort: null }])
  })

  it('throws for unknown panels, reports busy sessions, closes one and all', () => {
    const { m } = manager()
    expect(() => m.get('x')).toThrow('Sessão de agente não encontrada: x')
    m.create('a', { type: 'agent', projectPath: '/p' })
    m.create('b', { type: 'agent', projectPath: '/p' })
    expect(m.hasBusy()).toBe(false)
    m.get('a').send('oi')
    expect(m.hasBusy()).toBe(true)
    m.close('a')
    expect(() => m.get('a')).toThrow()
    m.closeAll()
    expect(() => m.get('b')).toThrow()
    expect(m.hasBusy()).toBe(false)
  })
})
