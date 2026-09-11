import { describe, expect, it, vi } from 'vitest'
import { createQuitGuard } from '../../src/main/quitGuard'

function guard(opts: { busy?: boolean; skip?: boolean; answers?: boolean[] } = {}) {
  const answers = [...(opts.answers ?? [])]
  const ask = vi.fn((_parent?: string) => answers.shift() ?? false)
  const g = createQuitGuard<string>({ hasBusy: () => opts.busy ?? true, skipConfirm: () => opts.skip ?? false, ask })
  return { g, ask }
}

describe('quitGuard', () => {
  it('lets the window close and the app quit without asking when no agent is busy', () => {
    const { g, ask } = guard({ busy: false })
    expect(g.allowWindowClose('win')).toBe(true)
    expect(g.allowQuit('win')).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })

  it('keeps the window open on Cancel and asks again on the next attempt', () => {
    const { g, ask } = guard({ answers: [false, false] })
    expect(g.allowWindowClose('win')).toBe(false)
    expect(g.allowQuit('win')).toBe(false)
    expect(ask.mock.calls).toEqual([['win'], ['win']])
  })

  it('does not ask twice once the window close was confirmed', () => {
    const { g, ask } = guard({ answers: [true] })
    expect(g.allowWindowClose('win')).toBe(true)
    expect(g.allowQuit(undefined)).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('still asks without a parent window when quitting with no window', () => {
    const { g, ask } = guard({ answers: [true] })
    expect(g.allowQuit(undefined)).toBe(true)
    expect(ask).toHaveBeenCalledWith(undefined)
    expect(g.allowWindowClose('win')).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('never asks when confirmation is disabled (E2E)', () => {
    const { g, ask } = guard({ skip: true })
    expect(g.allowWindowClose('win')).toBe(true)
    expect(g.allowQuit(undefined)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })
})
