import { describe, expect, it } from 'vitest'
import { replacementPatch } from '@renderer/dock/panelParams'

describe('replacementPatch', () => {
  it('explicitly undefines every key from `current` that is missing in `next`', () => {
    const result = replacementPatch({ type: 'agent', projectPath: '/p', sessionId: 'old', model: 'opus' }, { type: 'agent', projectPath: '/p', model: 'opus' })
    expect(result).toEqual({ type: 'agent', projectPath: '/p', sessionId: undefined, model: 'opus' })
    expect('sessionId' in result).toBe(true)
    expect(result.sessionId).toBeUndefined()
  })

  it('passes `next` through unchanged when there is no current object', () => {
    expect(replacementPatch(undefined, { type: 'terminal', projectPath: '/p' })).toEqual({ type: 'terminal', projectPath: '/p' })
  })
})
