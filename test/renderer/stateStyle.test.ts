import { describe, expect, it } from 'vitest'
import { stateDotClass } from '@renderer/dock/stateStyle'

describe('stateDotClass', () => {
  it('maps each state to a color class', () => {
    expect(stateDotClass('running')).toContain('bg-blue-500')
    expect(stateDotClass('running')).toContain('animate-pulse')
    expect(stateDotClass('awaiting_permission')).toContain('bg-orange-500')
    expect(stateDotClass('error')).toContain('bg-red-500')
    expect(stateDotClass('idle')).toContain('bg-neutral-500')
    expect(stateDotClass('exited')).toContain('bg-neutral-700')
    expect(stateDotClass('starting')).toContain('bg-neutral-400')
  })
})
