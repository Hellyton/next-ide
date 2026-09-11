import { describe, expect, it } from 'vitest'
import { buildAddPanelOptions, newPanelId, panelTitle } from '@renderer/dock/panelOptions'

describe('panelOptions', () => {
  it('panelTitle per type', () => {
    expect(panelTitle({ type: 'agent', projectPath: '/g/api' })).toBe('api · claude')
    expect(panelTitle({ type: 'terminal', projectPath: '/g/api' })).toBe('api · zsh')
    expect(panelTitle({ type: 'file', projectPath: '/g/api', filePath: '/g/api/src/a.ts' })).toBe('a.ts')
  })

  it('newPanelId prefixes type', () => {
    expect(newPanelId('terminal', () => 'u1')).toBe('terminal-u1')
  })

  it('builds options for active group', () => {
    const params = { type: 'terminal' as const, projectPath: '/g/api' }
    expect(buildAddPanelOptions(params, 'terminal-1', { kind: 'activeGroup', groupId: 'g1' })).toEqual({
      id: 'terminal-1',
      component: 'terminal',
      title: 'api · zsh',
      params,
      renderer: 'always',
      position: { referenceGroup: 'g1' },
    })
    expect(buildAddPanelOptions(params, 'terminal-1', { kind: 'activeGroup' })).not.toHaveProperty('position')
  })

  it('builds options for split', () => {
    const params = { type: 'agent' as const, projectPath: '/g/api' }
    expect(
      buildAddPanelOptions(params, 'agent-1', { kind: 'split', referencePanelId: 'terminal-1', direction: 'below' })
        .position,
    ).toEqual({ referencePanel: 'terminal-1', direction: 'below' })
  })
})
