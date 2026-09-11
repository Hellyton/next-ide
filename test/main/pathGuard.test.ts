import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside, resolveInsideRoots } from '../../src/main/fs/pathGuard'

describe('isInside', () => {
  it('accepts the root and descendants, rejects siblings and parents', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true)
    expect(isInside('/a/b/c/d.ts', '/a/b')).toBe(true)
    expect(isInside('/a/bc', '/a/b')).toBe(false)
    expect(isInside('/a', '/a/b')).toBe(false)
    expect(isInside('/a/b/../x', '/a/b')).toBe(false)
  })
  it('does not confuse names that start with two dots with parent traversal', () => {
    expect(isInside('/a/b/..hidden', '/a/b')).toBe(true)
  })
})

describe('resolveInsideRoots', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'guard-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'guard-out-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'x')
    writeFileSync(join(outside, 'secret.txt'), 's')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))
    return { root, outside }
  }

  it('returns the real path for files inside a root', async () => {
    const { root } = setup()
    expect(await resolveInsideRoots(join(root, 'src', 'a.ts'), [root])).toMatch(/src\/a\.ts$/)
  })

  it('rejects relative paths, missing files, other folders and symlink escapes', async () => {
    const { root, outside } = setup()
    expect(await resolveInsideRoots('src/a.ts', [root])).toBeNull()
    expect(await resolveInsideRoots(join(root, 'nope.ts'), [root])).toBeNull()
    expect(await resolveInsideRoots(join(outside, 'secret.txt'), [root])).toBeNull()
    expect(await resolveInsideRoots(join(root, 'link.txt'), [root])).toBeNull()
  })
})
