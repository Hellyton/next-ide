import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService } from '../../src/main/git/GitService'

function repo(): { dir: string; git(...args: string[]): string; service: GitService } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'git-service-')))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'a.txt'), 'um\n')
  writeFileSync(join(dir, 'b.txt'), 'um\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'inicial')
  return { dir, git, service: new GitService(async () => [dir]) }
}

describe('GitService', () => {
  it('reports the branch and the changed files', async () => {
    const { dir, service } = repo()
    writeFileSync(join(dir, 'a.txt'), 'dois\n')
    writeFileSync(join(dir, 'novo.txt'), 'x\n')
    const o = await service.overview(dir)
    expect(o.branch).toBe('main')
    expect(o.upstream).toBeNull()
    expect(o.changes).toEqual([
      { path: 'a.txt', status: 'M' },
      { path: 'novo.txt', status: 'U' },
    ])
  })

  it('refuses folders outside the workspaces', async () => {
    const { service } = repo()
    expect((await service.overview('/tmp')).branch).toBeNull()
    expect((await service.checkout('/tmp', { kind: 'create', name: 'x' })).ok).toBe(false)
  })

  it('creates, lists and switches branches, and refuses unsafe names', async () => {
    const { dir, git, service } = repo()
    expect(await service.checkout(dir, { kind: 'create', name: 'feat/x' })).toEqual({ ok: true, value: null })
    expect((await service.branches(dir)).current).toBe('feat/x')
    expect((await service.branches(dir)).local.sort()).toEqual(['feat/x', 'main'])
    expect((await service.checkout(dir, { kind: 'existing', name: 'main' })).ok).toBe(true)
    expect(git('branch', '--show-current')).toBe('main')
    expect((await service.checkout(dir, { kind: 'existing', name: '--orphan' })).ok).toBe(false)
    expect((await service.checkout(dir, { kind: 'existing', name: 'nao-existe' })).ok).toBe(false)
  })

  it('commits only the selected files, even when others are staged', async () => {
    const { dir, git, service } = repo()
    writeFileSync(join(dir, 'a.txt'), 'dois\n')
    writeFileSync(join(dir, 'b.txt'), 'dois\n')
    writeFileSync(join(dir, 'novo.txt'), 'x\n')
    git('add', 'b.txt')
    expect(await service.commit(dir, ['a.txt', 'novo.txt'], 'muda a', 'detalhe')).toEqual({ ok: true, value: null })
    expect(git('show', '--name-only', '--format=%s%n%b', 'HEAD').split('\n').filter(Boolean)).toEqual(['muda a', 'detalhe', 'a.txt', 'novo.txt'])
    expect((await service.overview(dir)).changes).toEqual([{ path: 'b.txt', status: 'M' }])
    expect((await service.commit(dir, ['b.txt'], '  ', '')).ok).toBe(false)
    expect((await service.commit(dir, ['../fora'], 'x', '')).ok).toBe(false)
  })

  it('treats paths literally: pathspec magic cannot widen a commit', async () => {
    const { dir, git, service } = repo()
    writeFileSync(join(dir, 'a.txt'), 'dois\n')
    writeFileSync(join(dir, 'b.txt'), 'dois\n')
    for (const magic of [':/', ':(top)', ':(glob)*', ':!a.txt', '*.txt']) expect((await service.commit(dir, [magic], 'tudo', '')).ok).toBe(false)
    expect(git('log', '--format=%s')).toBe('inicial')
    expect((await service.diff(dir, ':/')).ok && (await service.diff(dir, ':/'))).toMatchObject({ value: '' })
  })

  it('diffs tracked and untracked files', async () => {
    const { dir, service } = repo()
    writeFileSync(join(dir, 'a.txt'), 'dois\n')
    writeFileSync(join(dir, 'novo.txt'), 'x\n')
    const tracked = await service.diff(dir, 'a.txt')
    expect(tracked.ok && tracked.value).toContain('+dois')
    const untracked = await service.diff(dir, 'novo.txt')
    expect(untracked.ok && untracked.value).toContain('+x')
  })

  it('pushes a new branch to the remote, then pulls what someone else pushed', async () => {
    const { dir, git, service } = repo()
    const remote = realpathSync(mkdtempSync(join(tmpdir(), 'git-remote-')))
    execFileSync('git', ['init', '-q', '--bare', remote])
    git('remote', 'add', 'origin', remote)
    expect(await service.sync(dir, 'push')).toEqual({ ok: true, value: null })
    expect((await service.overview(dir)).upstream).toBe('origin/main')
    writeFileSync(join(dir, 'a.txt'), 'tres\n')
    await service.commit(dir, ['a.txt'], 'local', '')
    expect((await service.overview(dir)).ahead).toBe(1)
    git('push', '-q')
    git('reset', '-q', '--hard', 'HEAD~1')
    await service.sync(dir, 'fetch')
    expect((await service.overview(dir)).behind).toBe(1)
    expect((await service.sync(dir, 'pull')).ok).toBe(true)
    expect((await service.overview(dir)).behind).toBe(0)
  })
})
