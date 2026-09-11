import { beforeEach, describe, expect, it } from 'vitest'
import { handleAgentEvent, selectChat, useAgents } from '@renderer/stores/agentStore'
import { useSessions } from '@renderer/stores/sessionsStore'

describe('agentStore', () => {
  beforeEach(() => {
    useAgents.setState({ chats: {} })
    useSessions.setState({ byId: {}, order: [] })
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

  it('loads history, clears and removes', () => {
    useAgents.getState().load('p1', [{ kind: 'user', id: 'u', text: 'antiga', images: 0 }])
    expect(useAgents.getState().chats.p1!.items).toHaveLength(1)
    useAgents.getState().clear('p1')
    expect(useAgents.getState().chats.p1!.items).toEqual([])
    useAgents.getState().remove('p1')
    expect(useAgents.getState().chats.p1).toBeUndefined()
  })
})
