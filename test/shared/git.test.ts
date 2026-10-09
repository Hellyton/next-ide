import { describe, expect, it } from 'vitest'
import { isBranchName, isRepoPath, nextSync, parseDiff } from '../../src/shared/git'

describe('git helpers', () => {
  it('picks the sync action like GitHub Desktop: pull, then push, otherwise fetch', () => {
    expect(nextSync({ branch: 'dev', upstream: 'origin/dev', ahead: 2, behind: 1 })).toBe('pull')
    expect(nextSync({ branch: 'dev', upstream: 'origin/dev', ahead: 2, behind: 0 })).toBe('push')
    expect(nextSync({ branch: 'nova', upstream: null, ahead: 0, behind: 0 })).toBe('push')
    expect(nextSync({ branch: 'dev', upstream: 'origin/dev', ahead: 0, behind: 0 })).toBe('fetch')
    expect(nextSync({ branch: '@abc123', upstream: null, ahead: 0, behind: 0 })).toBe('fetch')
  })

  it('rejects branch names that git refuses or that read as options', () => {
    expect(isBranchName('feat/comandos-modelo')).toBe(true)
    expect(isBranchName('origin/dev')).toBe(true)
    for (const bad of ['', '-f', '--force', 'a b', 'a..b', 'a~1', 'x.lock', '/x', 'x/', 'a:b']) expect(isBranchName(bad)).toBe(false)
  })

  it('rejects paths that leave the project', () => {
    expect(isRepoPath('src/a.ts')).toBe(true)
    for (const bad of ['', '/etc/passwd', '../x', 'a/../../x']) expect(isRepoPath(bad)).toBe(false)
  })

  it('parses a unified diff body and drops the file header', () => {
    const diff = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,2 +1,2 @@', ' igual', '-velho', '+novo', ''].join('\n')
    expect(parseDiff(diff)).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'ctx', text: 'igual' },
      { kind: 'del', text: 'velho' },
      { kind: 'add', text: 'novo' },
    ])
    expect(parseDiff('Binary files differ')).toEqual([])
  })
})
