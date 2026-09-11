import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FilesService } from '../../src/main/fs/FilesService'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'files-'))
  const outside = mkdtempSync(join(tmpdir(), 'files-out-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  writeFileSync(join(root, '.gitignore'), 'secret.txt\n')
  writeFileSync(join(root, 'secret.txt'), 's')
  writeFileSync(join(outside, 'x.txt'), 'x')
  symlinkSync(join(outside, 'x.txt'), join(root, 'link.txt'))
  return { root, outside, files: new FilesService(async () => [root]) }
}

describe('FilesService', () => {
  it('lists dirs of a known project, keeping the caller-provided path prefix', async () => {
    const { root, files } = setup()
    const entries = await files.list(root, root)
    expect(entries.map((e) => e.name)).toEqual(['src', '.gitignore', 'link.txt'])
    expect(entries[0]!.path).toBe(join(root, 'src'))
  })

  it('refuses to list unknown projects or dirs outside the project', async () => {
    const { root, outside, files } = setup()
    await expect(files.list(outside, outside)).rejects.toThrow('fora')
    await expect(files.list(root, outside)).rejects.toThrow('fora')
  })

  it('reads files inside roots and refuses the rest', async () => {
    const { root, outside, files } = setup()
    expect(await files.read(join(root, 'src', 'a.ts'))).toMatchObject({ kind: 'text', text: 'a' })
    expect(await files.read(join(root, 'gone.ts'))).toEqual({ kind: 'missing' })
    expect(await files.read(join(outside, 'x.txt'))).toEqual({ kind: 'forbidden' })
    expect(await files.read(join(root, 'link.txt'))).toEqual({ kind: 'forbidden' })
    expect(await files.read('src/a.ts')).toEqual({ kind: 'forbidden' })
  })

  it('indexes and reports status only for known projects', async () => {
    const { root, outside, files } = setup()
    expect((await files.index(root)).sort()).toEqual(['.gitignore', 'link.txt', 'src/a.ts'])
    expect(await files.index(outside)).toEqual([])
    expect(await files.status(outside)).toEqual({})
  })

  it('re-reads .gitignore after invalidateIgnore', async () => {
    const { root, files } = setup()
    expect((await files.list(root, root)).map((e) => e.name)).not.toContain('secret.txt')
    writeFileSync(join(root, '.gitignore'), '')
    files.invalidateIgnore(root)
    expect((await files.list(root, root)).map((e) => e.name)).toContain('secret.txt')
  })
})
