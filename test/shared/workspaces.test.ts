import { describe, expect, it } from 'vitest'
import type { Workspace } from '@shared/models'
import {
  addProjects,
  addWorkspace,
  basename,
  filterWorkspaces,
  moveWorkspace,
  moveWorkspaceById,
  projectPaths,
  removeProject,
  removeWorkspace,
  renameWorkspace,
  toggleWorkspace,
  uniqueProjects,
} from '@shared/workspaces'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

const sample = (): Workspace[] => [
  {
    id: 'w1',
    name: 'papersystem',
    collapsed: false,
    projects: [
      { id: 'p1', name: 'papersystem-api', path: '/g/papersystem-api' },
      { id: 'p2', name: 'papersystem-ui', path: '/g/papersystem-ui' },
    ],
  },
  { id: 'w2', name: 'edukaflow', collapsed: true, projects: [{ id: 'p3', name: 'daringtech', path: '/g/daringtech' }] },
]

describe('workspaces', () => {
  it('basename takes last path segment', () => {
    expect(basename('/Users/me/papersystem-api')).toBe('papersystem-api')
    expect(basename('/Users/me/papersystem-api/')).toBe('papersystem-api')
  })

  it('addWorkspace appends with trimmed name and default', () => {
    const newId = ids()
    const a = addWorkspace([], '  papersystem ', newId)
    expect(a).toEqual([{ id: 'id1', name: 'papersystem', projects: [], collapsed: false }])
    expect(addWorkspace(a, '   ', newId)[1]!.name).toBe('Workspace')
  })

  it('renameWorkspace ignores blank names', () => {
    expect(renameWorkspace(sample(), 'w1', 'novo')[0]!.name).toBe('novo')
    expect(renameWorkspace(sample(), 'w1', '  ')[0]!.name).toBe('papersystem')
  })

  it('removeWorkspace and toggleWorkspace', () => {
    expect(removeWorkspace(sample(), 'w1').map((w) => w.id)).toEqual(['w2'])
    expect(toggleWorkspace(sample(), 'w2')[1]!.collapsed).toBe(false)
  })

  it('moveWorkspace reorders and ignores out-of-range', () => {
    expect(moveWorkspace(sample(), 0, 1).map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(moveWorkspace(sample(), 0, 5).map((w) => w.id)).toEqual(['w1', 'w2'])
  })

  it('addProjects skips duplicates and names by basename', () => {
    const out = addProjects(sample(), 'w2', ['/g/daringtech', '/g/novo', '/g/novo'], ids())
    expect(out[1]!.projects.map((p) => p.name)).toEqual(['daringtech', 'novo'])
    expect(out[1]!.projects[1]!.id).toBe('id1')
  })

  it('removeProject', () => {
    expect(removeProject(sample(), 'w1', 'p1')[0]!.projects.map((p) => p.id)).toEqual(['p2'])
  })

  it('filterWorkspaces matches project names and expands', () => {
    const out = filterWorkspaces(sample(), 'UI')
    expect(out).toHaveLength(1)
    expect(out[0]!.projects.map((p) => p.id)).toEqual(['p2'])
  })

  it('filterWorkspaces keeps full workspace when its name matches', () => {
    const out = filterWorkspaces(sample(), 'eduka')
    expect(out).toHaveLength(1)
    expect(out[0]!.projects).toHaveLength(1)
    expect(out[0]!.collapsed).toBe(false)
  })

  it('filterWorkspaces returns list unchanged for blank query', () => {
    const list = sample()
    expect(filterWorkspaces(list, '  ')).toBe(list)
  })
})

describe('project helpers', () => {
  const list = [
    { id: 'w1', name: 'a', collapsed: false, projects: [{ id: 'p1', name: 'api', path: '/x/api' }, { id: 'p2', name: 'ui', path: '/x/ui' }] },
    { id: 'w2', name: 'b', collapsed: false, projects: [{ id: 'p3', name: 'api', path: '/x/api' }] },
  ]
  it('uniqueProjects / projectPaths drop repeated paths', () => {
    expect(uniqueProjects(list).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(projectPaths(list)).toEqual(['/x/api', '/x/ui'])
  })
  it('moveWorkspaceById moves the dragged workspace to the target index', () => {
    expect(moveWorkspaceById(list, 'w2', 'w1').map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(moveWorkspaceById(list, 'nope', 'w1')).toBe(list)
  })
})
