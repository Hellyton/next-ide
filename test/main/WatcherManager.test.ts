import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyChange, WatcherManager, type WatchFn } from '../../src/main/fs/WatcherManager'

describe('classifyChange', () => {
  it('routes working tree, git metadata and noise', () => {
    expect(classifyChange('src/a.ts')).toBe('fs')
    expect(classifyChange(null)).toBe('fs')
    expect(classifyChange('.git/HEAD')).toBe('git')
    expect(classifyChange('.git/index')).toBe('git')
    expect(classifyChange('.git/refs/heads/main')).toBe('git')
    expect(classifyChange('.git/objects/ab/cdef')).toBe('ignore')
    expect(classifyChange('node_modules/x/index.js')).toBe('ignore')
    expect(classifyChange('pkg/node_modules/x.js')).toBe('ignore')
  })
})

describe('WatcherManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const handlers = new Map<string, (rel: string | null) => void>()
    const closed: string[] = []
    const watch: WatchFn = (root, onChange) => {
      handlers.set(root, onChange)
      return { close: () => closed.push(root) }
    }
    const fsChanged = vi.fn()
    const gitChanged = vi.fn()
    const mgr = new WatcherManager(watch, { fsChanged, gitChanged }, 200)
    return { mgr, handlers, closed, fsChanged, gitChanged }
  }

  it('debounces changes per project into one fs:changed and one git:changed', () => {
    const { mgr, handlers, fsChanged, gitChanged } = setup()
    mgr.sync(['/p'])
    handlers.get('/p')!('src/a.ts')
    handlers.get('/p')!('src/b.ts')
    handlers.get('/p')!('.git/objects/zz')
    expect(fsChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fsChanged).toHaveBeenCalledWith('/p', ['/p/src/a.ts', '/p/src/b.ts'])
    expect(gitChanged).toHaveBeenCalledTimes(1)
  })

  it('emits only git:changed for git metadata and the project root for unknown changes', () => {
    const { mgr, handlers, fsChanged, gitChanged } = setup()
    mgr.sync(['/p'])
    handlers.get('/p')!('.git/HEAD')
    vi.advanceTimersByTime(200)
    expect(fsChanged).not.toHaveBeenCalled()
    expect(gitChanged).toHaveBeenCalledWith('/p')
    handlers.get('/p')!(null)
    vi.advanceTimersByTime(200)
    expect(fsChanged).toHaveBeenCalledWith('/p', ['/p'])
  })

  it('opens new roots, closes removed ones, and closeAll cancels pending emits', () => {
    const { mgr, handlers, closed, fsChanged } = setup()
    mgr.sync(['/a', '/b'])
    mgr.sync(['/b', '/c'])
    expect(closed).toEqual(['/a'])
    expect([...handlers.keys()]).toEqual(['/a', '/b', '/c'])
    handlers.get('/b')!('x.ts')
    mgr.closeAll()
    vi.advanceTimersByTime(200)
    expect(fsChanged).not.toHaveBeenCalled()
    expect(closed.sort()).toEqual(['/a', '/b', '/c'])
  })

  it('survives a watch function that throws', () => {
    const fsChanged = vi.fn()
    const mgr = new WatcherManager(() => { throw new Error('ENOENT') }, { fsChanged, gitChanged: vi.fn() })
    expect(() => mgr.sync(['/gone'])).not.toThrow()
  })
})
