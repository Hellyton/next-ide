import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitInfo } from '../../src/main/git/gitInfo'

const tmp = () => mkdtempSync(join(tmpdir(), 'gitinfo-'))
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

describe('gitInfo', () => {
  it('returns current branch, even without commits', async () => {
    const d = tmp()
    git(d, 'init', '-q', '-b', 'dev')
    expect(await gitInfo(d)).toEqual({ branch: 'dev' })
  })

  it('returns short sha when detached', async () => {
    const d = tmp()
    git(d, 'init', '-q', '-b', 'main')
    writeFileSync(join(d, 'a.txt'), 'a')
    git(d, 'add', '.')
    git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
    git(d, 'checkout', '-q', '--detach')
    expect((await gitInfo(d)).branch).toMatch(/^@[0-9a-f]{7,}$/)
  })

  it('returns null outside a repo or for missing dir', async () => {
    expect(await gitInfo(tmp())).toEqual({ branch: null })
    expect(await gitInfo('/nope/does/not/exist')).toEqual({ branch: null })
  })
})
