import { describe, expect, it } from 'vitest'
import { INVOKE_CHANNELS, type Handlers } from '@shared/ipc-contract'
import { registerHandlers } from '../../src/main/ipc/register'

describe('registerHandlers', () => {
  it('registers every channel and strips the event argument', async () => {
    const registered = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const calls: unknown[][] = []
    const handlers = Object.fromEntries(
      INVOKE_CHANNELS.map((c) => [c, (...args: unknown[]) => (calls.push([c, ...args]), 'ok')]),
    ) as unknown as Handlers
    registerHandlers({ handle: (channel, fn) => void registered.set(channel, fn) }, handlers)
    expect([...registered.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort())
    expect(await registered.get('git:info')!({ sender: 1 }, '/proj')).toBe('ok')
    expect(calls).toEqual([['git:info', '/proj']])
  })
})
