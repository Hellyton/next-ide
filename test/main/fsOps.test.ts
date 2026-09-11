import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_VIEW_BYTES } from '@shared/files'
import { listDir, loadIgnore, readViewable } from '../../src/main/fs/fsOps'

function project() {
  const root = mkdtempSync(join(tmpdir(), 'fsops-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'dist'))
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.gitignore'), 'dist/\n*.log\n')
  writeFileSync(join(root, 'README.md'), '# oi')
  writeFileSync(join(root, 'debug.log'), 'x')
  writeFileSync(join(root, 'src', 'b.ts'), 'b')
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  return root
}

describe('listDir', () => {
  it('lists dirs first then files, hiding .git, node_modules and gitignored entries', async () => {
    const root = project()
    const ig = await loadIgnore(root)
    const entries = await listDir(root, root, ig)
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual(['dir:src', 'file:.gitignore', 'file:README.md'])
    expect((await listDir(join(root, 'src'), root, ig)).map((e) => e.name)).toEqual(['a.ts', 'b.ts'])
  })
})

describe('readViewable', () => {
  it('reads text, images as data URLs, and flags binary, too-large and missing files', async () => {
    const root = project()
    expect(await readViewable(join(root, 'README.md'))).toEqual({ kind: 'text', text: '# oi', size: 4 })
    writeFileSync(join(root, 'p.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(await readViewable(join(root, 'p.png'))).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,iVBORw==', size: 4 })
    writeFileSync(join(root, 'bin.dat'), Buffer.from([1, 0, 2]))
    expect(await readViewable(join(root, 'bin.dat'))).toEqual({ kind: 'binary', size: 3 })
    writeFileSync(join(root, 'big.txt'), Buffer.alloc(MAX_VIEW_BYTES + 1, 97))
    expect(await readViewable(join(root, 'big.txt'))).toEqual({ kind: 'too-large', size: MAX_VIEW_BYTES + 1 })
    expect(await readViewable(join(root, 'nope.txt'))).toEqual({ kind: 'missing' })
  })

  it('treats non-regular files (directories, FIFOs) as binary instead of blocking or throwing', async () => {
    const root = project()
    expect(await readViewable(join(root, 'src'))).toEqual({ kind: 'binary', size: expect.any(Number) })
    const fifo = join(root, 'a.fifo')
    try {
      execFileSync('mkfifo', [fifo])
    } catch {
      return // mkfifo unavailable on this platform — directory case above still covers the fix
    }
    expect(await readViewable(fifo)).toEqual({ kind: 'binary', size: expect.any(Number) })
  })
})
