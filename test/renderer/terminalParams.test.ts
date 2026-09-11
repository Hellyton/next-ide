import { describe, expect, it } from 'vitest'
import { withoutInitialCommand } from '@renderer/panels/terminal/terminalParams'

describe('withoutInitialCommand', () => {
  it('strips initialCommand from terminal panel params', () => {
    const result = withoutInitialCommand({ type: 'terminal', projectPath: '/p', initialCommand: 'claude /login' })
    expect(result).toEqual({ type: 'terminal', projectPath: '/p' })
    expect('initialCommand' in result).toBe(false)
  })
})
