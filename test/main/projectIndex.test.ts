import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitStatus, indexProject, parsePorcelainZ } from '../../src/main/fs/projectIndex'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

function project() {
  const root = mkdtempSync(join(tmpdir(), 'index-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, '.gitignore'), 'dist/\n')
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  writeFileSync(join(root, 'dist', 'out.js'), 'o')
  writeFileSync(join(root, 'README.md'), 'r')
  return root
}

describe('indexProject', () => {
  it('uses git ls-files in a repo (tracked + untracked, not ignored)', async () => {
    const root = project()
    git(root, 'init', '-q', '-b', 'main')
    expect((await indexProject(root)).sort()).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
  })
  it('walks the tree respecting .gitignore outside git, and honors the limit', async () => {
    const root = project()
    expect((await indexProject(root)).sort()).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
    expect(await indexProject(root, 1)).toHaveLength(1)
  })
})

describe('parsePorcelainZ', () => {
  it('maps XY codes and skips the original path of renames', () => {
    const out = ' M src/a.ts\0A  new.ts\0?? tmp.txt\0 D gone.ts\0R  moved.ts\0old.ts\0'
    expect(parsePorcelainZ(out)).toEqual({ 'src/a.ts': 'M', 'new.ts': 'A', 'tmp.txt': 'U', 'gone.ts': 'D', 'moved.ts': 'R' })
  })
})

describe('gitStatus', () => {
  it('returns statuses for a repo and {} outside git', async () => {
    const root = project()
    expect(await gitStatus(root)).toEqual({})
    git(root, 'init', '-q', '-b', 'main')
    expect(await gitStatus(root)).toMatchObject({ 'src/a.ts': 'U', 'README.md': 'U' })
  })

  it('returns pkg-relative paths for a project that is a subfolder of the repo', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    git(repo, 'init', '-q', '-b', 'main')
    writeFileSync(join(repo, 'root-file.txt'), 'r')
    mkdirSync(join(repo, 'pkg'))
    writeFileSync(join(repo, 'pkg', 'a.ts'), 'a')
    expect(await gitStatus(join(repo, 'pkg'))).toEqual({ 'a.ts': 'U' })
  })
})
