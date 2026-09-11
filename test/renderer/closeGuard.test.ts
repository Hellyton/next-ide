import { describe, expect, it } from 'vitest'
import { CLOSE_CONFIRM_MESSAGE, needsCloseConfirm } from '@renderer/dock/closeGuard'

describe('needsCloseConfirm', () => {
  it('asks only for busy agent panels', () => {
    expect(needsCloseConfirm('agent', 'running')).toBe(true)
    expect(needsCloseConfirm('agent', 'awaiting_permission')).toBe(true)
    expect(needsCloseConfirm('agent', 'idle')).toBe(false)
    expect(needsCloseConfirm('terminal', 'running')).toBe(false)
    expect(needsCloseConfirm(undefined, undefined)).toBe(false)
    expect(CLOSE_CONFIRM_MESSAGE).toBe('O agente está trabalhando. Fechar mesmo assim?')
  })
})
