import { describe, expect, it } from 'vitest'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'

describe('AsyncQueue', () => {
  it('yields pushed items in order, including items pushed while waiting', async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    const seen: number[] = []
    const done = (async () => {
      for await (const n of q) seen.push(n)
    })()
    q.push(2)
    await Promise.resolve()
    q.push(3)
    q.end()
    await done
    expect(seen).toEqual([1, 2, 3])
  })

  it('ignores pushes after end and reports size', () => {
    const q = new AsyncQueue<string>()
    q.push('a')
    expect(q.size).toBe(1)
    q.end()
    q.push('b')
    expect(q.size).toBe(1)
  })
})
