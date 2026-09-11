import { create } from 'zustand'
import type { FsEntry, GitFileStatus } from '@shared/files'
import { dirsToReload } from '../files/tree'

type FilesState = {
  expanded: Record<string, true>
  children: Record<string, FsEntry[]>
  errors: Record<string, string>
  status: Record<string, Record<string, GitFileStatus>>
  indexes: Record<string, string[]>
  staleIndexes: Record<string, true>
  toggleDir(projectPath: string, dir: string): void
  loadDir(projectPath: string, dir: string): Promise<void>
  refreshStatus(projectPath: string): Promise<void>
  ensureIndex(projectPath: string): Promise<string[]>
  handleFsChanged(projectPath: string, paths: string[]): void
  handleGitChanged(projectPath: string): void
}

const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = rec
  return rest
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const inflightIndex = new Map<string, Promise<string[]>>()
// Single-flight per project: at most one refreshStatus in flight plus one pending rerun.
const statusInflight = new Set<string>()
const statusPending = new Set<string>()

export const useFiles = create<FilesState>()((set, get) => ({
  expanded: {},
  children: {},
  errors: {},
  status: {},
  indexes: {},
  staleIndexes: {},
  toggleDir: (projectPath, dir) => {
    if (get().expanded[dir]) {
      set((s) => ({ expanded: without(s.expanded, dir) }))
      return
    }
    set((s) => ({ expanded: { ...s.expanded, [dir]: true } }))
    if (!get().children[dir]) void get().loadDir(projectPath, dir)
    if (dir === projectPath) void get().refreshStatus(projectPath)
  },
  loadDir: async (projectPath, dir) => {
    try {
      const entries = await window.api.invoke('fs:list', projectPath, dir)
      set((s) => ({ children: { ...s.children, [dir]: entries }, errors: without(s.errors, dir) }))
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, [dir]: `Não foi possível listar: ${message(err)}` } }))
    }
  },
  refreshStatus: async (projectPath) => {
    if (statusInflight.has(projectPath)) {
      statusPending.add(projectPath)
      return
    }
    statusInflight.add(projectPath)
    try {
      const status = await window.api.invoke('git:status', projectPath)
      set((s) => ({ status: { ...s.status, [projectPath]: status } }))
    } catch (err) {
      console.error('[next-ide] git status failed', projectPath, err)
    } finally {
      statusInflight.delete(projectPath)
      if (statusPending.delete(projectPath)) void get().refreshStatus(projectPath)
    }
  },
  ensureIndex: (projectPath) => {
    const cached = get().indexes[projectPath]
    if (cached && !get().staleIndexes[projectPath]) return Promise.resolve(cached)
    let pending = inflightIndex.get(projectPath)
    if (!pending) {
      pending = window.api
        .invoke('fs:index', projectPath)
        .then((index) => {
          set((s) => ({ indexes: { ...s.indexes, [projectPath]: index }, staleIndexes: without(s.staleIndexes, projectPath) }))
          return index
        })
        .catch((err) => {
          console.error('[next-ide] file index failed', projectPath, err)
          return []
        })
        .finally(() => inflightIndex.delete(projectPath))
      inflightIndex.set(projectPath, pending)
    }
    return pending
  },
  handleFsChanged: (projectPath, paths) => {
    // Mark stale instead of deleting: Quick Open / sidebar filter / @ mentions keep showing the
    // old list (rather than going blank) until the next ensureIndex refetches it.
    set((s) => ({ staleIndexes: { ...s.staleIndexes, [projectPath]: true } }))
    for (const dir of dirsToReload(projectPath, Object.keys(get().children), paths)) void get().loadDir(projectPath, dir)
  },
  handleGitChanged: (projectPath) => {
    if (get().status[projectPath]) void get().refreshStatus(projectPath)
  },
}))

let subscribed = false
export function subscribeFileEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('fs:changed', (projectPath, paths) => useFiles.getState().handleFsChanged(projectPath, paths))
  window.api.on('git:changed', (projectPath) => useFiles.getState().handleGitChanged(projectPath))
}
