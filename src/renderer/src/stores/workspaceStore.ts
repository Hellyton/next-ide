import { create } from 'zustand'
import type { Workspace } from '@shared/models'
import {
  addProjects,
  addWorkspace,
  removeProject,
  removeWorkspace,
  renameWorkspace,
  toggleWorkspace,
} from '@shared/workspaces'

type WorkspaceState = {
  workspaces: Workspace[]
  loaded: boolean
  query: string
  load(): Promise<void>
  setQuery(q: string): void
  addWorkspace(name: string): void
  rename(id: string, name: string): void
  remove(id: string): void
  toggle(id: string): void
  addFolder(workspaceId: string): Promise<void>
  importCodeWorkspace(): Promise<void>
  removeProject(workspaceId: string, projectId: string): void
}

const uuid = () => crypto.randomUUID()

export const useWorkspaces = create<WorkspaceState>()((set, get) => {
  const commit = (next: Workspace[]) => {
    set({ workspaces: next })
    void window.api.invoke('workspace:save', next)
  }
  return {
    workspaces: [],
    loaded: false,
    query: '',
    load: async () => set({ workspaces: await window.api.invoke('workspace:get'), loaded: true }),
    setQuery: (query) => set({ query }),
    addWorkspace: (name) => commit(addWorkspace(get().workspaces, name, uuid)),
    rename: (id, name) => commit(renameWorkspace(get().workspaces, id, name)),
    remove: (id) => commit(removeWorkspace(get().workspaces, id)),
    toggle: (id) => commit(toggleWorkspace(get().workspaces, id)),
    addFolder: async (workspaceId) => {
      const path = await window.api.invoke('fs:pickFolder')
      if (path) commit(addProjects(get().workspaces, workspaceId, [path], uuid))
    },
    importCodeWorkspace: async () => {
      const picked = await window.api.invoke('fs:pickWorkspaceFile')
      if (!picked) return
      const withWs = addWorkspace(get().workspaces, picked.name, uuid)
      const created = withWs[withWs.length - 1]!
      commit(addProjects(withWs, created.id, picked.paths, uuid))
    },
    removeProject: (workspaceId, projectId) => commit(removeProject(get().workspaces, workspaceId, projectId)),
  }
})
