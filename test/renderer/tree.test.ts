import { describe, expect, it } from 'vitest'
import { dirsToReload, entryStatus, isUnder, relPath } from '@renderer/files/tree'

describe('tree helpers', () => {
  it('isUnder / relPath work on posix prefixes without false siblings', () => {
    expect(isUnder('/p/src/a.ts', '/p')).toBe(true)
    expect(isUnder('/p', '/p')).toBe(true)
    expect(isUnder('/px/a.ts', '/p')).toBe(false)
    expect(relPath('/p', '/p/src/a.ts')).toBe('src/a.ts')
    expect(relPath('/p', '/p')).toBe('')
  })

  it('dirsToReload picks loaded parents of changed paths, or everything for a root change', () => {
    const loaded = ['/p', '/p/src', '/p/src/deep', '/q']
    expect(dirsToReload('/p', loaded, ['/p/src/a.ts'])).toEqual(['/p/src'])
    expect(dirsToReload('/p', loaded, ['/p/src/deep'])).toEqual(['/p/src', '/p/src/deep'])
    expect(dirsToReload('/p', loaded, ['/p/other/x.ts'])).toEqual([])
    expect(dirsToReload('/p', loaded, ['/p'])).toEqual(['/p', '/p/src', '/p/src/deep'])
  })

  it('entryStatus: exact for files, dirty marker for folders containing changes', () => {
    const status = { 'src/a.ts': 'M' as const, 'README.md': 'U' as const }
    expect(entryStatus(status, '/p', { name: 'a.ts', path: '/p/src/a.ts', kind: 'file' })).toBe('M')
    expect(entryStatus(status, '/p', { name: 'src', path: '/p/src', kind: 'dir' })).toBe('M')
    expect(entryStatus(status, '/p', { name: 'lib', path: '/p/lib', kind: 'dir' })).toBeUndefined()
    expect(entryStatus(undefined, '/p', { name: 'a.ts', path: '/p/src/a.ts', kind: 'file' })).toBeUndefined()
  })
})
