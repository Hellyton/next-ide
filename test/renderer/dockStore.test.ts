import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDock } from '@renderer/dock/dockStore'

function fakeApi(panels: Array<{ id: string; params: Record<string, unknown> }>) {
  const addPanel = vi.fn()
  const live = panels.map((p) => ({ ...p, api: { updateParameters: vi.fn(), setActive: vi.fn() } }))
  useDock.setState({
    api: { panels: live, addPanel, activeGroup: undefined, getPanel: (id: string) => live.find((p) => p.id === id) } as never,
    lastAgent: {},
  })
  return { addPanel, live }
}

describe('dockStore', () => {
  beforeEach(() => useDock.setState({ api: null, lastAgent: {} }))

  it('open returns the new panel id', () => {
    const { addPanel } = fakeApi([])
    const id = useDock.getState().open({ type: 'terminal', projectPath: '/p' })
    expect(id).toMatch(/^terminal-/)
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({ id }))
  })

  it('openFile focuses an existing panel for the same file and replaces its line', () => {
    const { addPanel, live } = fakeApi([{ id: 'f1', params: { type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 3 } }])
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 9 })
    expect(addPanel).not.toHaveBeenCalled()
    expect(live[0]!.api.updateParameters).toHaveBeenCalledWith({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 9 })
    expect(live[0]!.api.setActive).toHaveBeenCalled()
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/a.ts' })
    expect(live[0]!.api.updateParameters).toHaveBeenLastCalledWith({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: undefined })
  })

  it('openFile opens a new panel for another file', () => {
    const { addPanel } = fakeApi([{ id: 'f1', params: { type: 'file', projectPath: '/p', filePath: '/p/a.ts' } }])
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/b.ts' })
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({ component: 'file', title: 'b.ts' }))
  })

  it('openBeside splits to the right of the reference panel', () => {
    const { addPanel } = fakeApi([{ id: 'agent-1', params: { type: 'agent', projectPath: '/g/api' } }])
    const id = useDock.getState().openBeside('agent-1', { type: 'agent', projectPath: '/g/api', sessionId: 's2' })
    expect(id).toMatch(/^agent-/)
    expect(addPanel).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { type: 'agent', projectPath: '/g/api', sessionId: 's2' }, position: { referencePanel: 'agent-1', direction: 'right' } }),
    )
  })

  it('noteActive remembers the last active agent per project', () => {
    fakeApi([
      { id: 'a1', params: { type: 'agent', projectPath: '/p' } },
      { id: 't1', params: { type: 'terminal', projectPath: '/p' } },
    ])
    useDock.getState().noteActive('a1')
    useDock.getState().noteActive('t1')
    expect(useDock.getState().lastAgent).toEqual({ '/p': 'a1' })
  })
})
