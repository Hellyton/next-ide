import { beforeEach, describe, expect, it } from 'vitest'
import { useSessions } from '@renderer/stores/sessionsStore'

const s = (panelId: string) => ({
  panelId,
  type: 'terminal' as const,
  projectPath: '/p',
  title: 'p · zsh',
  state: 'idle' as const,
})

describe('sessionsStore', () => {
  beforeEach(() => useSessions.setState({ byId: {}, order: [] }))

  it('adds in order and ignores duplicates', () => {
    useSessions.getState().add(s('a'))
    useSessions.getState().add(s('b'))
    useSessions.getState().add(s('a'))
    expect(useSessions.getState().order).toEqual(['a', 'b'])
  })

  it('updates state and removes', () => {
    useSessions.getState().add(s('a'))
    useSessions.getState().setState('a', 'exited')
    expect(useSessions.getState().byId.a!.state).toBe('exited')
    useSessions.getState().setState('zzz', 'running')
    useSessions.getState().remove('a')
    expect(useSessions.getState().order).toEqual([])
    expect(useSessions.getState().byId).toEqual({})
  })

  it('renames a session', () => {
    useSessions.getState().add({ panelId: 'r1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    useSessions.getState().setTitle('r1', 'Novo · claude')
    expect(useSessions.getState().byId.r1!.title).toBe('Novo · claude')
    useSessions.getState().setTitle('missing', 'x')
    expect(useSessions.getState().byId.missing).toBeUndefined()
  })
})
