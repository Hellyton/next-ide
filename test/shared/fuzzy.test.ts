import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from '@shared/fuzzy'

describe('fuzzyScore', () => {
  it('returns null when characters are missing and a number otherwise', () => {
    expect(fuzzyScore('xyz', 'src/app.ts')).toBeNull()
    expect(fuzzyScore('app', 'src/app.ts')).toEqual(expect.any(Number))
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
  it('prefers matches in the file name over matches in folders', () => {
    const inName = fuzzyScore('tree', 'src/sidebar/FileTree.tsx')!
    const inFolder = fuzzyScore('tree', 'src/tree/index.ts')!
    expect(inName).toBeGreaterThan(inFolder)
  })
  it('is case-insensitive and rewards consecutive characters', () => {
    expect(fuzzyScore('READ', 'README.md')).not.toBeNull()
    expect(fuzzyScore('read', 'README.md')!).toBeGreaterThan(fuzzyScore('rdme', 'README.md')!)
  })
})

describe('fuzzyFilter', () => {
  it('filters, ranks and limits', () => {
    const items = ['src/main/index.ts', 'src/renderer/src/App.tsx', 'README.md', 'docs/app-notes.md']
    expect(fuzzyFilter('app', items, (s) => s)).toEqual(['docs/app-notes.md', 'src/renderer/src/App.tsx'])
    expect(fuzzyFilter('', items, (s) => s, 2)).toEqual(['src/main/index.ts', 'src/renderer/src/App.tsx'])
  })
})
