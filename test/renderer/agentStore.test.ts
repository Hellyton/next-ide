import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAgentEvent, selectChat, useAgents } from '@renderer/stores/agentStore'
import { useDock } from '@renderer/dock/dockStore'
import { useSessions } from '@renderer/stores/sessionsStore'

/** Minimal fake dockview api so `persistParams` has a panel to update. */
function fakeDockApi(panelId: string, extraParams: Record<string, unknown> = {}) {
  const params = { type: 'agent' as const, projectPath: '/p', ...extraParams }
  const updateParameters = vi.fn()
  useDock.setState({
    api: {
      getPanel: (id: string) => (id === panelId ? { params, api: { updateParameters } } : undefined),
    } as never,
  })
  return updateParameters
}

describe('agentStore', () => {
  beforeEach(() => {
    useAgents.setState({ chats: {} })
    useSessions.setState({ byId: {}, order: [] })
    useDock.setState({ api: null })
  })

  it('applies events per panel and mirrors status into the sessions store', () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    handleAgentEvent('p1', { kind: 'status', state: 'running' })
    handleAgentEvent('p1', { kind: 'user', id: 'u', text: 'oi', images: 0 })
    expect(selectChat('p1')(useAgents.getState()).state).toBe('running')
    expect(selectChat('p1')(useAgents.getState()).items).toHaveLength(1)
    expect(useSessions.getState().byId.p1!.state).toBe('running')
    expect(selectChat('other')(useAgents.getState()).items).toEqual([])
  })

  it('drops late events for panels that are no longer in the dock', () => {
    handleAgentEvent('gone', { kind: 'status', state: 'exited' })
    handleAgentEvent('gone', { kind: 'user', id: 'u', text: 'tarde', images: 0 })
    expect(useAgents.getState().chats.gone).toBeUndefined()
  })

  it('does not persist the session id from init until the panel has a user message', () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    const updateParameters = fakeDockApi('p1')
    handleAgentEvent('p1', { kind: 'init', sessionId: 's1', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: [] })
    expect(updateParameters).not.toHaveBeenCalled()
    handleAgentEvent('p1', { kind: 'user', id: 'u1', text: 'oi', images: 0 })
    expect(updateParameters).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }))
  })

  it('persists the session id from init immediately when the panel already has a user message', () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    useAgents.getState().apply('p1', { kind: 'user', id: 'u0', text: 'oi', images: 0 })
    const updateParameters = fakeDockApi('p1')
    handleAgentEvent('p1', { kind: 'init', sessionId: 's2', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: [] })
    expect(updateParameters).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's2' }))
  })

  it('clears a pending session id when the panel is removed', () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    fakeDockApi('p1')
    handleAgentEvent('p1', { kind: 'init', sessionId: 's3', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: [] })
    useAgents.getState().remove('p1')
    const updateParameters = fakeDockApi('p1')
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    handleAgentEvent('p1', { kind: 'user', id: 'u1', text: 'oi', images: 0 })
    expect(updateParameters).not.toHaveBeenCalled()
  })

  it("clear drops a pending session id so a restart can't persist a stale one", () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    fakeDockApi('p1')
    // sessionA's init arrives before any user message: it's held pending, not persisted.
    handleAgentEvent('p1', { kind: 'init', sessionId: 'sessionA', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: [] })

    // restartSession() clears the chat before swapping to a different session (e.g. /resume).
    useAgents.getState().clear('p1')
    // ...then replaces the panel params with the resumed session (sessionB).
    const updateParameters = fakeDockApi('p1', { sessionId: 'sessionB' })

    // The first local `user` event of the new (resumed) session must not resurrect sessionA's
    // stale pending entry and overwrite sessionB.
    handleAgentEvent('p1', { kind: 'user', id: 'u1', text: 'oi', images: 0 })
    expect(updateParameters).not.toHaveBeenCalled()

    // sessionB's own init (now that the panel has a user item) persists sessionB, not sessionA.
    handleAgentEvent('p1', { kind: 'init', sessionId: 'sessionB', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: [] })
    expect(updateParameters).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sessionB' }))
    expect(updateParameters).not.toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sessionA' }))
  })

  it('loads history, clears and removes', () => {
    useAgents.getState().load('p1', [{ kind: 'user', id: 'u', text: 'antiga', images: 0 }])
    expect(useAgents.getState().chats.p1!.items).toHaveLength(1)
    useAgents.getState().clear('p1')
    expect(useAgents.getState().chats.p1!.items).toEqual([])
    useAgents.getState().remove('p1')
    expect(useAgents.getState().chats.p1).toBeUndefined()
  })
})
