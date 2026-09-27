import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DictationEvent } from '@shared/dictation'
import { DictationManager, type ChildLike } from '../../src/main/dictation/DictationManager'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  signals: string[] = []
  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.signals.push(signal)
    return true
  }
  out(text: string | Buffer) {
    this.stdout.emit('data', typeof text === 'string' ? Buffer.from(text) : text)
  }
  /** Node order: 'exit' may come before stdout is drained; 'close' comes after both. */
  finish(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emit('exit', code, signal)
    this.emit('close', code, signal)
  }
}

function setup(over: { exists?: boolean; spawnThrows?: boolean } = {}) {
  const children: FakeChild[] = []
  const events: Array<[string, DictationEvent]> = []
  const mgr = new DictationManager({
    exists: () => over.exists ?? true,
    spawn: () => {
      if (over.spawnThrows) throw new Error('spawn EACCES')
      const c = new FakeChild()
      children.push(c)
      return c as unknown as ChildLike
    },
    emit: (id, e) => events.push([id, e]),
  })
  return { mgr, children, events }
}

describe('DictationManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('forwards parsed helper lines, even when a line arrives in pieces', () => {
    const { mgr, children, events } = setup()
    expect(mgr.start('p1')).toEqual({ ok: true, value: null })
    children[0]!.out('{"type":"ready"}\n{"type":"transcript","final":"ab')
    children[0]!.out('re","volatile":""}\nlixo\n')
    expect(events).toEqual([
      ['p1', { type: 'ready' }],
      ['p1', { type: 'transcript', final: 'abre', volatile: '' }],
    ])
  })

  it('stop sends SIGTERM and emits ended when the helper exits cleanly', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    children[0]!.finish(0)
    expect(events).toEqual([['p1', { type: 'ended' }]])
  })

  it('SIGKILLs a helper that ignores SIGTERM for 3s', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    vi.advanceTimersByTime(2999)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    vi.advanceTimersByTime(1)
    expect(children[0]!.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  it('does not SIGKILL after the helper already exited', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    children[0]!.finish(0)
    vi.advanceTimersByTime(5000)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
  })

  it('a crash without an error line still reports an error, then ended', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.finish(1)
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'O ditado parou inesperadamente (código 1).' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('an exit after an error line does not add a second error', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.out('{"type":"error","message":"Permissão negada"}\n')
    children[0]!.finish(1)
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'Permissão negada' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('a spawn error event reports it and ends', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.emit('error', new Error('spawn ENOENT'))
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'Falha ao iniciar o ditado: spawn ENOENT' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('starting on another panel stops the first; only one records', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.start('p2')
    expect(children).toHaveLength(2)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    children[0]!.finish(0)
    children[1]!.out('{"type":"ready"}\n')
    expect(events).toEqual([
      ['p1', { type: 'ended' }],
      ['p2', { type: 'ready' }],
    ])
  })

  it('starting again on the recording panel is a no-op', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    expect(mgr.start('p1')).toEqual({ ok: true, value: null })
    expect(children).toHaveLength(1)
  })

  it('stop for a panel that is not recording does nothing', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p2')
    expect(children[0]!.signals).toEqual([])
  })

  it('reports a missing helper binary without spawning', () => {
    const { mgr, children } = setup({ exists: false })
    expect(mgr.start('p1')).toEqual({ ok: false, message: 'Helper de ditado não encontrado (rode npm run build:dictation).' })
    expect(children).toHaveLength(0)
  })

  it('reports a throwing spawn', () => {
    const { mgr } = setup({ spawnThrows: true })
    expect(mgr.start('p1')).toEqual({ ok: false, message: 'spawn EACCES' })
  })

  it('ended waits for close, so output drained after exit still arrives first', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    children[0]!.emit('exit', 0, null)
    children[0]!.out('{"type":"transcript","final":"fim","volatile":""}\n')
    children[0]!.emit('close', 0, null)
    expect(events).toEqual([
      ['p1', { type: 'transcript', final: 'fim', volatile: '' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('a helper killed by a signal it was not asked for reports a crash', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.finish(null, 'SIGSEGV')
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'O ditado parou inesperadamente (SIGSEGV).' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('the SIGKILL after a requested stop is not reported as a crash', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    vi.advanceTimersByTime(3000)
    children[0]!.finish(null, 'SIGKILL')
    expect(events).toEqual([['p1', { type: 'ended' }]])
  })

  it('decodes a multi-byte character split across chunks', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    const bytes = Buffer.from('{"type":"transcript","final":"ação","volatile":""}\n')
    const cut = bytes.indexOf(0xc3) + 1
    children[0]!.out(bytes.subarray(0, cut))
    children[0]!.out(bytes.subarray(cut))
    expect(events).toEqual([['p1', { type: 'transcript', final: 'ação', volatile: '' }]])
  })

  it('stopAll stops the active helper', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stopAll()
    expect(children[0]!.signals).toEqual(['SIGTERM'])
  })
})
