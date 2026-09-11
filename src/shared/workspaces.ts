import type { Project, Workspace } from './models'

export type NewId = () => string

export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

export function addWorkspace(list: Workspace[], name: string, newId: NewId): Workspace[] {
  return [...list, { id: newId(), name: name.trim() || 'Workspace', projects: [], collapsed: false }]
}

export function renameWorkspace(list: Workspace[], id: string, name: string): Workspace[] {
  const next = name.trim()
  if (!next) return list
  return list.map((w) => (w.id === id ? { ...w, name: next } : w))
}

export function removeWorkspace(list: Workspace[], id: string): Workspace[] {
  return list.filter((w) => w.id !== id)
}

export function toggleWorkspace(list: Workspace[], id: string): Workspace[] {
  return list.map((w) => (w.id === id ? { ...w, collapsed: !w.collapsed } : w))
}

export function moveWorkspace(list: Workspace[], from: number, to: number): Workspace[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function addProjects(list: Workspace[], workspaceId: string, paths: string[], newId: NewId): Workspace[] {
  return list.map((w) => {
    if (w.id !== workspaceId) return w
    const seen = new Set(w.projects.map((p) => p.path))
    const added: Project[] = []
    for (const path of paths) {
      if (seen.has(path)) continue
      seen.add(path)
      added.push({ id: newId(), name: basename(path), path })
    }
    return { ...w, projects: [...w.projects, ...added] }
  })
}

export function removeProject(list: Workspace[], workspaceId: string, projectId: string): Workspace[] {
  return list.map((w) =>
    w.id === workspaceId ? { ...w, projects: w.projects.filter((p) => p.id !== projectId) } : w,
  )
}

export function uniqueProjects(list: Workspace[]): Project[] {
  const seen = new Set<string>()
  const out: Project[] = []
  for (const w of list) {
    for (const p of w.projects) {
      if (seen.has(p.path)) continue
      seen.add(p.path)
      out.push(p)
    }
  }
  return out
}

export const projectPaths = (list: Workspace[]): string[] => uniqueProjects(list).map((p) => p.path)

export function moveWorkspaceById(list: Workspace[], id: string, targetId: string): Workspace[] {
  return moveWorkspace(list, list.findIndex((w) => w.id === id), list.findIndex((w) => w.id === targetId))
}

export function filterWorkspaces(
  list: Workspace[],
  query: string,
  keep: (p: Project) => boolean = () => false,
): Workspace[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.flatMap((w) => {
    if (w.name.toLowerCase().includes(q)) return [{ ...w, collapsed: false }]
    const projects = w.projects.filter((p) => keep(p) || p.name.toLowerCase().includes(q))
    return projects.length ? [{ ...w, projects, collapsed: false }] : []
  })
}
