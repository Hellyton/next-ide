import { describe, expect, it, vi } from 'vitest'
import { initialChat } from '@renderer/agent/chatReducer'
import { restartSession, type RestartSessionDeps } from '@renderer/agent/restartSession'
import type { AgentPanelParams } from '@shared/models'

function makeDeps(overrides: Partial<RestartSessionDeps> = {}): RestartSessionDeps {
  return {
    invoke: vi.fn(async () => undefined) as unknown as RestartSessionDeps['invoke'],
    getChat: vi.fn(() => initialChat),
    setChat: vi.fn(),
    clearChat: vi.fn(),
    loadChat: vi.fn(),
    currentParams: vi.fn(() => undefined),
    replaceParams: vi.fn(),
    apply: vi.fn(),
    setSessionState: vi.fn(),
    ...overrides,
  }
}

describe('restartSession', () => {
  it('closes, creates and starts in order, replacing params with next', async () => {
    const calls: string[] = []
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel)
    }) as unknown as RestartSessionDeps['invoke']
    const prevParams: AgentPanelParams = { type: 'agent', projectPath: '/p' }
    const deps = makeDeps({ invoke, currentParams: vi.fn(() => prevParams) })
    const next: AgentPanelParams = { type: 'agent', projectPath: '/p' }

    await expect(restartSession('panel1', next, [], deps)).resolves.toBe(true)

    expect(calls).toEqual(['agent:close', 'agent:create', 'agent:start'])
    expect(deps.clearChat).toHaveBeenCalledWith('panel1')
    expect(deps.replaceParams).toHaveBeenCalledWith('panel1', next)
    expect(deps.apply).not.toHaveBeenCalled()
    // close() reported `exited` for the old session; the fresh one is idle.
    expect(deps.setSessionState).toHaveBeenCalledWith('panel1', 'idle')
  })

  it('loads the given history and skips agent:start when next already has a sessionId', async () => {
    const calls: string[] = []
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel)
    }) as unknown as RestartSessionDeps['invoke']
    const deps = makeDeps({ invoke })
    const next: AgentPanelParams = { type: 'agent', projectPath: '/p', sessionId: 'restored' }
    const history = [{ kind: 'user' as const, id: 'h1', text: 'pergunta antiga', images: 0 }]

    await restartSession('panel1', next, history, deps)

    expect(calls).toEqual(['agent:close', 'agent:create'])
    expect(deps.loadChat).toHaveBeenCalledWith('panel1', history)
  })

  it('rolls back chat and params and retries the previous session when agent:create fails', async () => {
    const prevChat = {
      ...initialChat,
      items: [{ type: 'user' as const, id: 'u1', text: 'antiga', images: 0 }],
      tasks: [{ id: 't1', description: 'rodando', status: 'running' as const, background: false }],
    }
    const prevParams: AgentPanelParams = { type: 'agent', projectPath: '/p', sessionId: 'old' }
    let createCalls = 0
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'agent:create') {
        createCalls++
        if (createCalls === 1) throw new Error('runtime not ready')
      }
    }) as unknown as RestartSessionDeps['invoke']
    const deps = makeDeps({
      invoke,
      getChat: vi.fn(() => prevChat),
      currentParams: vi.fn(() => prevParams),
    })
    const next: AgentPanelParams = { type: 'agent', projectPath: '/p', sessionId: 'new-session' }

    await expect(restartSession('panel1', next, [{ kind: 'user', id: 'h1', text: 'pergunta antiga', images: 0 }], deps)).resolves.toBe(false)

    // A dead query's tasks can't be stopped anymore, so the rollback clears them.
    expect(deps.setChat).toHaveBeenCalledWith('panel1', { ...prevChat, tasks: [] })
    expect(deps.replaceParams).toHaveBeenLastCalledWith('panel1', prevParams)
    expect(deps.apply).toHaveBeenCalledWith(
      'panel1',
      expect.objectContaining({ kind: 'error', message: expect.stringContaining('Não foi possível trocar de sessão') }),
    )
    expect(invoke).toHaveBeenCalledWith('agent:create', 'panel1', prevParams)
    expect(createCalls).toBe(2)
  })

  it('swallows a second failure on the rollback retry but still reports it', async () => {
    const prevParams: AgentPanelParams = { type: 'agent', projectPath: '/p', sessionId: 'old' }
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'agent:create') throw new Error('still broken')
    }) as unknown as RestartSessionDeps['invoke']
    const deps = makeDeps({ invoke, currentParams: vi.fn(() => prevParams) })
    const next: AgentPanelParams = { type: 'agent', projectPath: '/p', sessionId: 'new-session' }

    await expect(restartSession('panel1', next, [], deps)).resolves.toBe(false)

    expect(deps.apply).toHaveBeenCalledTimes(2)
  })
})
