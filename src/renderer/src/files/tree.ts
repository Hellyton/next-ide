import type { FsEntry, GitFileStatus } from '@shared/files'

export const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`)
export const relPath = (root: string, path: string): string => (path === root ? '' : isUnder(path, root) ? path.slice(root.length + 1) : path)
const dirname = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '/'

/** Which already-loaded folders need a fresh `fs:list` after these paths changed. */
export function dirsToReload(projectPath: string, loadedDirs: string[], changed: string[]): string[] {
  const loaded = loadedDirs.filter((d) => isUnder(d, projectPath))
  if (changed.includes(projectPath)) return loaded
  const hit = new Set<string>()
  for (const c of changed) {
    hit.add(dirname(c))
    hit.add(c) // a loaded folder that was itself renamed/removed
  }
  return loaded.filter((d) => hit.has(d))
}

export function entryStatus(
  status: Record<string, GitFileStatus> | undefined,
  projectPath: string,
  entry: FsEntry,
): GitFileStatus | undefined {
  if (!status) return undefined
  const rel = relPath(projectPath, entry.path)
  if (entry.kind === 'file') return status[rel]
  const prefix = `${rel}/`
  return Object.keys(status).some((k) => k.startsWith(prefix)) ? 'M' : undefined
}

export const STATUS_CLASS: Record<GitFileStatus, string> = {
  M: 'text-amber-300',
  A: 'text-emerald-300',
  U: 'text-emerald-400',
  D: 'text-red-400 line-through',
  R: 'text-sky-300',
}
