import { lstat, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { Ignore } from 'ignore'
import { MAX_VIEW_BYTES, type FileContent, type FsEntry, type GitFileStatus } from '@shared/files'
import { listDir, loadIgnore, readViewable } from './fsOps'
import { isInside, resolveInsideRoots } from './pathGuard'
import { gitStatus, indexProject } from './projectIndex'

/**
 * Every file request from the renderer goes through here. Paths are validated against the
 * workspace project folders (lexically and after realpath) but served under the caller's own
 * spelling, so a project added as /var/... keeps /var/... paths even though realpath is /private/var/....
 */
export class FilesService {
  private readonly ignores = new Map<string, Promise<Ignore>>()

  constructor(private readonly roots: () => Promise<string[]>) {}

  private async isProject(projectPath: string): Promise<boolean> {
    return (await this.roots()).includes(projectPath)
  }

  private ignoreFor(projectPath: string): Promise<Ignore> {
    let ig = this.ignores.get(projectPath)
    if (!ig) {
      ig = loadIgnore(projectPath)
      this.ignores.set(projectPath, ig)
    }
    return ig
  }

  invalidateIgnore(projectPath: string): void {
    this.ignores.delete(projectPath)
  }

  async list(projectPath: string, dir: string): Promise<FsEntry[]> {
    const abs = resolve(dir)
    const ok =
      isAbsolute(dir) &&
      (await this.isProject(projectPath)) &&
      isInside(abs, projectPath) &&
      (await resolveInsideRoots(abs, [projectPath])) !== null
    if (!ok) throw new Error('Pasta fora do projeto.')
    return listDir(abs, projectPath, await this.ignoreFor(projectPath))
  }

  async read(path: string): Promise<FileContent> {
    if (!isAbsolute(path)) return { kind: 'forbidden' }
    const abs = resolve(path)
    const roots = await this.roots()
    if (!roots.some((r) => isInside(abs, r))) return { kind: 'forbidden' }
    const real = await resolveInsideRoots(abs, roots)
    if (!real) {
      try {
        await lstat(abs)
        return { kind: 'forbidden' } // exists, but resolves outside (symlink escape)
      } catch {
        return { kind: 'missing' }
      }
    }
    return readViewable(real)
  }

  /** Overwrites an existing file inside a workspace project. Never creates files, never escapes. */
  async write(path: string, content: string): Promise<void> {
    const abs = isAbsolute(path) ? resolve(path) : null
    const roots = await this.roots()
    if (!abs || !roots.some((r) => isInside(abs, r))) throw new Error('Arquivo fora das pastas dos workspaces.')
    const real = await resolveInsideRoots(abs, roots)
    if (!real) throw new Error('Arquivo não encontrado.')
    if (!(await stat(real)).isFile()) throw new Error('Só é possível salvar arquivos.')
    if (Buffer.byteLength(content, 'utf8') > MAX_VIEW_BYTES) throw new Error('Arquivo maior que 2 MB.')
    await writeFile(real, content, 'utf8')
  }

  async index(projectPath: string): Promise<string[]> {
    return (await this.isProject(projectPath)) ? indexProject(projectPath) : []
  }

  async status(projectPath: string): Promise<Record<string, GitFileStatus>> {
    return (await this.isProject(projectPath)) ? gitStatus(projectPath) : {}
  }
}
