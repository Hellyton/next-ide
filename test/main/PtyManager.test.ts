import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PtyManager, type PtyLike } from '../../src/main/pty/PtyManager'

class FakePty implements PtyLike {
  dataCb: ((d: string) => void) | null = null
  exitCb: ((e: { exitCode: number }) => void) | null = null
  written: string[] = []
  size: [number, number] | null = null
  killed = false
  onData(cb: (d: string) => void) {
    this.dataCb = cb
  }
  onExit(cb: (e: { exitCode: number }) => void) {
    this.exitCb = cb
  }
  write(d: string) {
    this.written.push(d)
  }
  resize(c: number, r: number) {
    this.size = [c, r]
  }
  kill() {
    this.killed = true
  }
}

function setup() {
  const spawned: Array<{ pty: FakePty; cwd: string; cols: number; rows: number }> = []
  const events: string[] = []
  const mgr = new PtyManager(
    (cwd, cols, rows) => {
      const pty = new FakePty()
      spawned.push({ pty, cwd, cols, rows })
      return pty
    },
    { data: (id, c) => events.push(`data:${id}:${c}`), exit: (id, code) => events.push(`exit:${id}:${code}`) },
    16,
  )
  return { mgr, spawned, events }
}

describe('PtyManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('spawns with cwd and size, and emits batched output', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 100, 30)
    expect(spawned[0]).toMatchObject({ cwd: '/proj', cols: 100, rows: 30 })
    spawned[0]!.pty.dataCb!('he')
    spawned[0]!.pty.dataCb!('llo')
    vi.advanceTimersByTime(16)
    expect(events).toEqual(['data:t1:hello'])
  })

  it('forwards write and resize; ignores unknown ids', () => {
    const { mgr, spawned } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.write('t1', 'ls\r')
    mgr.resize('t1', 120, 40)
    mgr.write('nope', 'x')
    expect(spawned[0]!.pty.written).toEqual(['ls\r'])
    expect(spawned[0]!.pty.size).toEqual([120, 40])
  })

  it('kill stops the process and forgets it', () => {
    const { mgr, spawned } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.kill('t1')
    expect(spawned[0]!.pty.killed).toBe(true)
    expect(mgr.has('t1')).toBe(false)
  })

  it('exit flushes output, emits exit and forgets the pty', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 80, 24)
    spawned[0]!.pty.dataCb!('bye')
    spawned[0]!.pty.exitCb!({ exitCode: 0 })
    expect(events).toEqual(['data:t1:bye', 'exit:t1:0'])
    expect(mgr.has('t1')).toBe(false)
  })

  it('re-creating the same id kills the old pty and ignores its late exit', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.create('t1', '/proj', 80, 24)
    expect(spawned[0]!.pty.killed).toBe(true)
    spawned[0]!.pty.exitCb!({ exitCode: 1 })
    expect(mgr.has('t1')).toBe(true)
    expect(events).toEqual([])
  })

  it('killAll kills every pty', () => {
    const { mgr, spawned } = setup()
    mgr.create('a', '/p', 80, 24)
    mgr.create('b', '/p', 80, 24)
    mgr.killAll()
    expect(spawned.every((s) => s.pty.killed)).toBe(true)
  })
})
