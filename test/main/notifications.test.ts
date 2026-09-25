import { describe, expect, it } from 'vitest'
import { AgentNotifier, notificationFor } from '../../src/main/agent/notifications'

describe('notificationFor', () => {
  it('notifies when a turn finishes, asks for permission or fails', () => {
    expect(notificationFor('running', 'idle')).toEqual({ reason: 'done' })
    expect(notificationFor('awaiting_permission', 'idle')).toEqual({ reason: 'done' })
    expect(notificationFor('running', 'awaiting_permission')).toEqual({ reason: 'permission' })
    expect(notificationFor('running', 'error')).toEqual({ reason: 'error' })
    expect(notificationFor('idle', 'error')).toEqual({ reason: 'error' })
  })
  it('ignores synthetic or repeated transitions', () => {
    expect(notificationFor(undefined, 'idle')).toBeNull()
    expect(notificationFor('exited', 'idle')).toBeNull()
    expect(notificationFor('idle', 'running')).toBeNull()
    expect(notificationFor('error', 'error')).toBeNull()
    expect(notificationFor('running', 'exited')).toBeNull()
    expect(notificationFor('exited', 'error')).toBeNull()
    expect(notificationFor(undefined, 'error')).toBeNull()
  })
})

function notifier(over: Partial<ConstructorParameters<typeof AgentNotifier>[0]> = {}) {
  const shown: Array<{ title: string; body: string; panelId: string }> = []
  const n = new AgentNotifier({
    isFocused: () => false,
    enabled: () => true,
    projectOf: () => '/g/api',
    show: (x) => void shown.push(x),
    ...over,
  })
  return { n, shown }
}

describe('AgentNotifier', () => {
  it('shows one notification per transition with the project name', () => {
    const { n, shown } = notifier()
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'awaiting_permission' })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    expect(shown).toEqual([
      { title: 'api · Claude', body: 'Pedindo permissão', panelId: 'p1' },
      { title: 'api · Claude', body: 'Terminou', panelId: 'p1' },
    ])
  })
  it('stays quiet while focused or disabled, and ignores non-status events', () => {
    let focused = true
    let enabled = true
    const { n, shown } = notifier({ isFocused: () => focused, enabled: () => enabled })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    focused = false
    enabled = false
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'error' })
    n.onEvent('p1', { kind: 'query-start' })
    expect(shown).toEqual([])
  })
  it('forget drops the previous state so a new panel with the same id starts clean', () => {
    const { n, shown } = notifier()
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.forget('p1')
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    expect(shown).toEqual([])
  })
  it('shows the error body', () => {
    const { n, shown } = notifier({ projectOf: () => undefined })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'error' })
    expect(shown).toEqual([{ title: 'Claude', body: 'Erro na sessão', panelId: 'p1' }])
  })
})
