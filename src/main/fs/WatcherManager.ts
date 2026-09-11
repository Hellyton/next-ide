import { join, sep } from 'node:path'

export type WatchHandle = { close(): void }
/** `rel` is relative to `root`; null when the OS didn't say which file changed. */
export type WatchFn = (root: string, onChange: (rel: string | null) => void) => WatchHandle
export type WatchEmitter = {
  fsChanged(projectPath: string, paths: string[]): void
  gitChanged(projectPath: string): void
}

export function classifyChange(rel: string | null): 'fs' | 'git' | 'ignore' {
  if (rel === null) return 'fs'
  const parts = rel.split(sep).join('/').split('/')
  if (parts[0] === '.git') {
    const p = parts.join('/')
    return p === '.git/HEAD' || p === '.git/index' || p.startsWith('.git/refs/') ? 'git' : 'ignore'
  }
  return parts.includes('node_modules') ? 'ignore' : 'fs'
}

type Entry = { handle: WatchHandle; timer: ReturnType<typeof setTimeout> | null; paths: Set<string>; git: boolean }

export class WatcherManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly watch: WatchFn,
    private readonly emit: WatchEmitter,
    private readonly debounceMs = 200,
  ) {}

  sync(roots: string[]): void {
    const wanted = new Set(roots)
    for (const root of [...this.entries.keys()]) if (!wanted.has(root)) this.close(root)
    for (const root of wanted) if (!this.entries.has(root)) this.open(root)
  }

  closeAll(): void {
    for (const root of [...this.entries.keys()]) this.close(root)
  }

  private open(root: string): void {
    try {
      const entry: Entry = { handle: { close: () => undefined }, timer: null, paths: new Set(), git: false }
      entry.handle = this.watch(root, (rel) => this.onChange(root, rel))
      this.entries.set(root, entry)
    } catch (err) {
      console.error('[next-ide] failed to watch', root, err)
    }
  }

  private close(root: string): void {
    const entry = this.entries.get(root)
    if (!entry) return
    this.entries.delete(root)
    if (entry.timer) clearTimeout(entry.timer)
    try {
      entry.handle.close()
    } catch (err) {
      console.error('[next-ide] failed to close watcher', root, err)
    }
  }

  private onChange(root: string, rel: string | null): void {
    const entry = this.entries.get(root)
    const kind = classifyChange(rel)
    if (!entry || kind === 'ignore') return
    if (kind === 'fs') entry.paths.add(rel === null ? root : join(root, rel))
    // Any working-tree change can change `git status`; git metadata changes can change the branch.
    entry.git = true
    entry.timer ??= setTimeout(() => this.flush(root), this.debounceMs)
  }

  private flush(root: string): void {
    const entry = this.entries.get(root)
    if (!entry) return
    entry.timer = null
    const paths = [...entry.paths]
    entry.paths.clear()
    const git = entry.git
    entry.git = false
    if (paths.length > 0) this.emit.fsChanged(root, paths)
    if (git) this.emit.gitChanged(root)
  }
}
