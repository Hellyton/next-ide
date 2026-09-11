import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFiles } from '@renderer/stores/filesStore'

const invoke = vi.fn()
vi.stubGlobal('window', { api: { invoke, on: vi.fn(() => () => undefined) } })

describe('filesStore', () => {
  beforeEach(() => {
    invoke.mockReset()
    useFiles.setState({ expanded: {}, children: {}, errors: {}, status: {}, indexes: {} })
  })

  it('expanding a project root loads its children and git status', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'fs:list') return [{ name: 'a.ts', path: '/p/a.ts', kind: 'file' }]
      if (channel === 'git:status') return { 'a.ts': 'U' }
      return null
    })
    useFiles.getState().toggleDir('/p', '/p')
    await vi.waitFor(() => expect(useFiles.getState().children['/p']).toHaveLength(1))
    await vi.waitFor(() => expect(useFiles.getState().status['/p']).toEqual({ 'a.ts': 'U' }))
    expect(useFiles.getState().expanded['/p']).toBe(true)
    useFiles.getState().toggleDir('/p', '/p')
    expect(useFiles.getState().expanded['/p']).toBeUndefined()
  })

  it('records list errors per dir', async () => {
    invoke.mockRejectedValue(new Error('Pasta fora do projeto.'))
    await useFiles.getState().loadDir('/p', '/p')
    expect(useFiles.getState().errors['/p']).toContain('Pasta fora do projeto.')
  })

  it('ensureIndex caches and shares the in-flight request; fs changes drop the cache', async () => {
    invoke.mockResolvedValue(['a.ts'])
    const [a, b] = await Promise.all([useFiles.getState().ensureIndex('/p'), useFiles.getState().ensureIndex('/p')])
    expect(a).toEqual(['a.ts'])
    expect(b).toEqual(['a.ts'])
    expect(invoke).toHaveBeenCalledTimes(1)
    useFiles.getState().handleFsChanged('/p', ['/p/b.ts'])
    expect(useFiles.getState().indexes['/p']).toBeUndefined()
  })

  it('fs changes reload only loaded parent dirs', async () => {
    useFiles.setState({ children: { '/p': [], '/p/src': [] } })
    invoke.mockResolvedValue([])
    useFiles.getState().handleFsChanged('/p', ['/p/src/new.ts'])
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('fs:list', '/p', '/p/src'))
    expect(invoke).not.toHaveBeenCalledWith('fs:list', '/p', '/p')
  })

  it('git changes refresh status only for projects that loaded it', async () => {
    useFiles.setState({ status: { '/p': {} } })
    invoke.mockResolvedValue({ 'x.ts': 'M' })
    useFiles.getState().handleGitChanged('/q')
    expect(invoke).not.toHaveBeenCalled()
    useFiles.getState().handleGitChanged('/p')
    await vi.waitFor(() => expect(useFiles.getState().status['/p']).toEqual({ 'x.ts': 'M' }))
  })
})
