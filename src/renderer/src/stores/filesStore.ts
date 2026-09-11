import { create } from 'zustand'
import type { FsEntry, GitFileStatus } from '@shared/files'
import { dirsToReload } from '../files/tree'

type FilesState = {
  expanded: Record<string, true>
  children: Record<string, FsEntry[]>
  errors: Record<string, string>
  status: Record<string, Record<string, GitFileStatus>>
  indexes: Record<string, string[]>
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

export const useFiles = create<FilesState>()((set, get) => ({
  expanded: {},
  children: {},
  errors: {},
  status: {},
  indexes: {},
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
    try {
      const status = await window.api.invoke('git:status', projectPath)
      set((s) => ({ status: { ...s.status, [projectPath]: status } }))
    } catch (err) {
      console.error('[next-ide] git status failed', projectPath, err)
    }
  },
  ensureIndex: (projectPath) => {
    const cached = get().indexes[projectPath]
    if (cached) return Promise.resolve(cached)
    let pending = inflightIndex.get(projectPath)
    if (!pending) {
      pending = window.api
        .invoke('fs:index', projectPath)
        .then((index) => {
          set((s) => ({ indexes: { ...s.indexes, [projectPath]: index } }))
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
    set((s) => ({ indexes: without(s.indexes, projectPath) }))
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
