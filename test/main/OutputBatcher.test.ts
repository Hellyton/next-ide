import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutputBatcher } from '../../src/main/pty/OutputBatcher'

describe('OutputBatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces chunks within the window', () => {
    const out: string[] = []
    const b = new OutputBatcher((c) => out.push(c), 16)
    b.push('a')
    b.push('b')
    expect(out).toEqual([])
    vi.advanceTimersByTime(16)
    expect(out).toEqual(['ab'])
  })

  it('flush emits immediately and is a no-op when empty', () => {
    const out: string[] = []
    const b = new OutputBatcher((c) => out.push(c), 16)
    b.flush()
    b.push('x')
    b.flush()
    vi.advanceTimersByTime(50)
    expect(out).toEqual(['x'])
  })
})
