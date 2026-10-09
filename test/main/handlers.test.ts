import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { DEFAULT_SETTINGS } from '@shared/models'
import { AgentManager } from '../../src/main/agent/AgentManager'
import { fakeQuery, fakeSessions } from '../../src/main/agent/fakeQuery'
import { buildHandlers, type HandlerDeps } from '../../src/main/ipc/handlers'
import { createStores } from '../../src/main/store/stores'

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps & { ptyCalls: unknown[][]; agentEvents: Array<[string, AgentEvent]>; dictationCalls: string[] } {
  const ptyCalls: unknown[][] = []
  const agentEvents: Array<[string, AgentEvent]> = []
  const dictationCalls: string[] = []
  return {
    stores: createStores(mkdtempSync(join(tmpdir(), 'handlers-'))),
    pty: {
      create: (...a) => void ptyCalls.push(['create', ...a]),
      write: (...a) => void ptyCalls.push(['write', ...a]),
      resize: (...a) => void ptyCalls.push(['resize', ...a]),
      kill: (...a) => void ptyCalls.push(['kill', ...a]),
    },
    pickFolders: async () => ['/picked'],
    pickWorkspaceFile: async () => null,
    readTextFile: async () => '{}',
    gitInfo: async () => ({ branch: 'dev' }),
    agents: new AgentManager({ emit: (id, e) => agentEvents.push([id, e]), runtime: () => ({ queryFn: fakeQuery }) }),
    sessions: fakeSessions,
    agentReady: async () => undefined,
    runStatusLine: async () => 'linha',
    files: {
      list: async (p, d) => [{ name: 'a.ts', path: `${d}/a.ts`, kind: 'file' }],
      read: async () => ({ kind: 'missing' }),
      write: async () => undefined,
      index: async () => ['a.ts'],
      status: async () => ({ 'a.ts': 'M' }),
    },
    onWorkspaces: () => undefined,
    notificationsEnabled: () => true,
    windowTransparency: () => 0,
    windowBlur: () => 0,
    dictation: {
      start: (id) => {
        dictationCalls.push(`start:${id}`)
        return { ok: true, value: null }
      },
      stop: (id) => void dictationCalls.push(`stop:${id}`),
    },
    dictationCalls,
    ptyCalls,
    agentEvents,
    ...over,
  }
}

describe('buildHandlers (settings)', () => {
  it('settings:get drops status segments that are no longer offered', async () => {
    const d = deps()
    await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, statusline: { segments: ['project', 'cost', 'state', 'model'] as never, customScript: true } })
    const s = await buildHandlers(d)['settings:get']()
    expect(s.statusline.segments).toEqual(['project', 'model'])
  })

  it('settings:save always persists notifications from the dependency, never the payload', async () => {
    const d = deps({ notificationsEnabled: () => false })
    const h = buildHandlers(d)
    const { notifications: _drop, ...withoutNotifications } = { ...DEFAULT_SETTINGS, notifications: true }
    await h['settings:save'](withoutNotifications)
    expect((await d.stores.settings.read()).notifications).toBe(false)
  })

  it('settings:save always persists the window appearance from the dependencies, never the payload', async () => {
    const d = deps({ windowTransparency: () => 20, windowBlur: () => 50 })
    await buildHandlers(d)['settings:save']({ ...DEFAULT_SETTINGS, windowTransparency: 50, windowBlur: 0 })
    const saved = await d.stores.settings.read()
    expect([saved.windowTransparency, saved.windowBlur]).toEqual([20, 50])
  })
})

describe('buildHandlers (permission mode default)', () => {
  it('upgrades an older settings file to auto mode, once', async () => {
    const d = deps()
    await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, settingsVersion: undefined, defaultPermissionMode: 'default' })
    const h = buildHandlers(d)
    expect((await h['settings:get']()).defaultPermissionMode).toBe('auto')
    // Written back: a later explicit choice is kept.
    await h['settings:save']({ ...DEFAULT_SETTINGS, defaultPermissionMode: 'plan' })
    expect((await h['settings:get']()).defaultPermissionMode).toBe('plan')
  })

  it('agent:create starts a panel without a mode in the configured default', async () => {
    const create = vi.fn()
    const d = deps({ agents: { create, get: vi.fn(), close: vi.fn() } as unknown as HandlerDeps['agents'] })
    const h = buildHandlers(d)
    await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    expect(create).toHaveBeenCalledWith('p1', { type: 'agent', projectPath: '/p', permissionMode: 'auto' })
    await h['agent:create']('p2', { type: 'agent', projectPath: '/p', permissionMode: 'plan' })
    expect(create).toHaveBeenLastCalledWith('p2', { type: 'agent', projectPath: '/p', permissionMode: 'plan' })
  })

  it("agent:create starts a new panel with its project's last model/effort/mode", async () => {
    const create = vi.fn()
    const d = deps({ agents: { create, get: vi.fn(), close: vi.fn() } as unknown as HandlerDeps['agents'] })
    await d.stores.settings.writeNow({
      ...DEFAULT_SETTINGS,
      projectDefaults: { '/p': { model: 'opus', effort: 'low', permissionMode: 'plan' } },
    })
    const h = buildHandlers(d)
    await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    expect(create).toHaveBeenLastCalledWith('p1', { type: 'agent', projectPath: '/p', model: 'opus', effort: 'low', permissionMode: 'plan' })
    // Other projects keep the global default.
    await h['agent:create']('p2', { type: 'agent', projectPath: '/q' })
    expect(create).toHaveBeenLastCalledWith('p2', { type: 'agent', projectPath: '/q', permissionMode: 'auto' })
    // A panel's own choices win; a resumed session keeps its own model/effort.
    await h['agent:create']('p3', { type: 'agent', projectPath: '/p', model: 'haiku', permissionMode: 'default' })
    expect(create).toHaveBeenLastCalledWith('p3', { type: 'agent', projectPath: '/p', model: 'haiku', effort: 'low', permissionMode: 'default' })
    await h['agent:create']('p4', { type: 'agent', projectPath: '/p', sessionId: 's' })
    expect(create).toHaveBeenLastCalledWith('p4', { type: 'agent', projectPath: '/p', sessionId: 's', permissionMode: 'plan' })
  })
})

describe('buildHandlers', () => {
  it('workspace get/save round-trips after flush', async () => {
    const d = deps()
    const h = buildHandlers(d)
    expect(await h['workspace:get']()).toEqual([])
    const ws = [{ id: 'w', name: 'x', projects: [], collapsed: false }]
    await h['workspace:save'](ws)
    await d.stores.workspaces.flush()
    expect(await h['workspace:get']()).toEqual(ws)
  })

  it('settings:get merges defaults', async () => {
    const d = deps()
    await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, theme: 'light' })
    const s = await buildHandlers(d)['settings:get']()
    expect(s.theme).toBe('light')
    expect(s.statusline).toEqual(DEFAULT_SETTINGS.statusline)
  })

  it('settings:get deep-merges statusline defaults', async () => {
    const d = deps()
    await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, statusline: { customScript: true } as never })
    const s = await buildHandlers(d)['settings:get']()
    expect(s.statusline).toEqual({ segments: DEFAULT_SETTINGS.statusline.segments, customScript: true })
  })

  it('statusline:run delegates to the runner', async () => {
    expect(await buildHandlers(deps())['statusline:run']({} as never)).toBe('linha')
  })

  it('layout:get returns null by default', async () => {
    expect(await buildHandlers(deps())['layout:get']()).toBeNull()
  })

  it('fs:pickWorkspaceFile parses the chosen file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw-'))
    const file = join(dir, 'papersystem.code-workspace')
    writeFileSync(file, '{ "folders": [{ "path": "api" }] }')
    const h = buildHandlers(
      deps({
        pickWorkspaceFile: async () => file,
        readTextFile: async (p) => (await import('node:fs/promises')).readFile(p, 'utf8'),
      }),
    )
    expect(await h['fs:pickWorkspaceFile']()).toEqual({ name: 'papersystem', paths: [join(dir, 'api')] })
  })

  it('fs:pickWorkspaceFile returns null when cancelled', async () => {
    expect(await buildHandlers(deps())['fs:pickWorkspaceFile']()).toBeNull()
  })

  it('pty channels delegate to the manager', async () => {
    const d = deps()
    const h = buildHandlers(d)
    await h['pty:create']('t', '/p', 80, 24)
    await h['pty:write']('t', 'ls')
    await h['pty:resize']('t', 90, 30)
    await h['pty:kill']('t')
    expect(d.ptyCalls).toEqual([
      ['create', 't', '/p', 80, 24],
      ['write', 't', 'ls'],
      ['resize', 't', 90, 30],
      ['kill', 't'],
    ])
  })

  it('agent channels create, send and close sessions', async () => {
    const d = deps()
    const h = buildHandlers(d)
    await h['agent:create']('p1', { type: 'agent', projectPath: '/proj' })
    await h['agent:send']('p1', 'oi', [])
    await new Promise((r) => setTimeout(r, 5))
    expect(d.agentEvents.some(([id, e]) => id === 'p1' && e.kind === 'text')).toBe(true)
    expect((await h['agent:commands']('p1')).map((c) => c.name)).toEqual(['compact', 'review'])
    await h['agent:close']('p1')
    await expect(Promise.resolve().then(() => h['agent:interrupt']('p1'))).rejects.toThrow('Sessão de agente não encontrada')
  })

  it('agent:setDirs validates, resolves and dedupes directories', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dirs-'))
    const file = join(base, 'f.txt')
    writeFileSync(file, 'x')
    const h = buildHandlers(deps())
    await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    await expect(h['agent:setDirs']('p1', [base, `${base}/`, base])).resolves.toEqual({ ok: true, value: [realpathSync(base)] })
    await expect(h['agent:setDirs']('p1', ['relativo'])).resolves.toMatchObject({ ok: false, message: expect.stringContaining('relativo') })
    await expect(h['agent:setDirs']('p1', [join(base, 'nao-existe')])).resolves.toMatchObject({ ok: false })
    await expect(h['agent:setDirs']('p1', [file])).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é uma pasta') })
  })

  it('agent:setDirs resolves a relative path against the panel project and expands a leading ~', async () => {
    const project = mkdtempSync(join(tmpdir(), 'proj-'))
    const sub = join(project, 'sub')
    mkdirSync(sub)
    const h = buildHandlers(deps())
    await h['agent:create']('p1', { type: 'agent', projectPath: project })
    await expect(h['agent:setDirs']('p1', ['sub'])).resolves.toEqual({ ok: true, value: [realpathSync(sub)] })
    await expect(h['agent:setDirs']('p1', ['~'])).resolves.toEqual({ ok: true, value: [realpathSync(homedir())] })
  })

  it('agent:setDirs drops an existing directory that no longer exists instead of blocking the whole call', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dirs2-'))
    const toDelete = join(base, 'gone')
    mkdirSync(toDelete)
    const keep = join(base, 'keep')
    mkdirSync(keep)
    const h = buildHandlers(deps())
    await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    const first = await h['agent:setDirs']('p1', [toDelete])
    expect(first).toEqual({ ok: true, value: [realpathSync(toDelete)] })
    const [resolvedToDelete] = (first as { ok: true; value: string[] }).value
    rmSync(toDelete, { recursive: true })
    // The renderer's dirs list carries the already-resolved path back, not the original raw input.
    await expect(h['agent:setDirs']('p1', [resolvedToDelete!, keep])).resolves.toEqual({ ok: true, value: [realpathSync(keep)] })
  })

  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(
    'agent:setDirs reports a permission error distinctly from a missing folder',
    async () => {
      const parent = mkdtempSync(join(tmpdir(), 'locked-'))
      const target = join(parent, 'inner')
      mkdirSync(target)
      chmodSync(parent, 0o000)
      try {
        const h = buildHandlers(deps())
        await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
        await expect(h['agent:setDirs']('p1', [target])).resolves.toEqual({ ok: false, message: `Sem permissão para acessar: ${target}` })
      } finally {
        chmodSync(parent, 0o755)
      }
    },
  )

  it('agent:history converts stored messages into events', async () => {
    const events = await buildHandlers(deps())['agent:history']('/proj', 'fake-old')
    expect(events.map((e) => e.kind)).toEqual(['user', 'text', 'user', 'text'])
  })

  it('agent:forkBefore forks up to the entry before the message and returns its history', async () => {
    const fork = vi.fn(async () => 'fake-fork')
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    const r = await h['agent:forkBefore']('/proj', 'fake-old', 'h3')
    expect(fork).toHaveBeenCalledWith('/proj', 'fake-old', 'h2', undefined)
    expect(r).toEqual({
      ok: true,
      value: { sessionId: 'fake-fork', history: [{ kind: 'user', id: 'h1', text: 'pergunta antiga', images: 0 }, { kind: 'text', key: 'hm1:final:1', text: 'resposta antiga' }] },
    })
  })

  it('agent:forkBefore on the first message returns an empty conversation without forking', async () => {
    const fork = vi.fn()
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    await expect(h['agent:forkBefore']('/proj', 'fake-old', 'h1')).resolves.toEqual({ ok: true, value: { sessionId: null, history: [] } })
    expect(fork).not.toHaveBeenCalled()
  })

  it('agent:forkBefore and agent:rename report failures instead of throwing', async () => {
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, rename: async () => { throw new Error('ro') } } }))
    await expect(h['agent:forkBefore']('/proj', 'fake-old', 'zz')).resolves.toEqual({ ok: false, message: 'Mensagem não encontrada no histórico da sessão.' })
    await expect(h['agent:rename']('/proj', 'fake-old', 'T')).resolves.toEqual({ ok: false, message: 'ro' })
    await expect(buildHandlers(deps())['agent:rename']('/proj', 'fake-old', 'T')).resolves.toEqual({ ok: true, value: null })
  })

  it('agent:forkBefore forwards the session title to the fork', async () => {
    const fork = vi.fn(async () => 'fake-fork')
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    await h['agent:forkBefore']('/proj', 'fake-old', 'h3', 'Refactor')
    expect(fork).toHaveBeenCalledWith('/proj', 'fake-old', 'h2', 'Refactor')
  })

  it('agent:fork copies the whole session, forwarding the title', async () => {
    const fork = vi.fn(async () => 'fake-fork')
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    await expect(h['agent:fork']('/proj', 'fake-old', ' Experimento ')).resolves.toEqual({ ok: true, value: 'fake-fork' })
    expect(fork).toHaveBeenCalledWith('/proj', 'fake-old', undefined, 'Experimento')
    await h['agent:fork']('/proj', 'fake-old')
    expect(fork).toHaveBeenLastCalledWith('/proj', 'fake-old', undefined, undefined)
  })

  it('agent:fork reports failures', async () => {
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork: async () => { throw new Error('sem transcript') } } }))
    await expect(h['agent:fork']('/proj', 'x')).resolves.toEqual({ ok: false, message: 'sem transcript' })
  })

  it('agent:rename trims the title, collapses newlines and rejects an empty one', async () => {
    const rename = vi.fn(async () => undefined)
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, rename } }))
    await expect(h['agent:rename']('/proj', 'fake-old', '  Linha 1\n\nLinha 2 ')).resolves.toEqual({ ok: true, value: null })
    expect(rename).toHaveBeenCalledWith('/proj', 'fake-old', 'Linha 1 Linha 2')
    await expect(h['agent:rename']('/proj', 'fake-old', ' \n ')).resolves.toEqual({ ok: false, message: 'Título vazio.' })
    expect(rename).toHaveBeenCalledTimes(1)
  })

  it('agent:setEffort ignores values that are not effort levels', async () => {
    const setEffort = vi.fn(async () => undefined)
    const d = deps({ agents: { create: vi.fn(), get: () => ({ setEffort }), close: vi.fn() } as unknown as HandlerDeps['agents'] })
    const h = buildHandlers(d)
    await h['agent:setEffort']('p1', 'turbo' as never)
    expect(setEffort).not.toHaveBeenCalled()
    await h['agent:setEffort']('p1', null)
    await h['agent:setEffort']('p1', 'high')
    expect(setEffort.mock.calls).toEqual([[null], ['high']])
  })

  it('agent:create waits for the agent runtime to be ready', async () => {
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    const create = vi.fn()
    const d = deps({
      agents: { create, get: vi.fn(), close: vi.fn() } as unknown as HandlerDeps['agents'],
      agentReady: () => ready,
    })
    const h = buildHandlers(d)
    const p = h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    await Promise.resolve()
    expect(create).not.toHaveBeenCalled()
    release()
    await p
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith('p1', { type: 'agent', projectPath: '/p', permissionMode: 'auto' })
  })

  it('fs and git:status channels delegate to FilesService', async () => {
    const h = buildHandlers(deps())
    expect(await h['fs:list']('/p', '/p')).toEqual([{ name: 'a.ts', path: '/p/a.ts', kind: 'file' }])
    expect(await h['fs:read']('/p/a.ts')).toEqual({ kind: 'missing' })
    expect(await h['fs:index']('/p')).toEqual(['a.ts'])
    expect(await h['git:status']('/p')).toEqual({ 'a.ts': 'M' })
  })

  it('fs:write reports failures instead of throwing at the renderer', async () => {
    expect(await buildHandlers(deps())['fs:write']('/p/a.ts', 'x')).toEqual({ ok: true })
    const failing = deps()
    failing.files.write = async () => {
      throw new Error('Arquivo fora das pastas dos workspaces.')
    }
    expect(await buildHandlers(failing)['fs:write']('/nope', 'x')).toEqual({ ok: false, message: 'Arquivo fora das pastas dos workspaces.' })
  })

  it('workspace:save reports the new workspaces so watchers and roots follow', async () => {
    const onWorkspaces = vi.fn()
    const h = buildHandlers(deps({ onWorkspaces }))
    const ws = [{ id: 'w', name: 'x', projects: [{ id: 'p', name: 'p', path: '/p' }], collapsed: false }]
    await h['workspace:save'](ws)
    expect(onWorkspaces).toHaveBeenCalledWith(ws)
  })
})

describe('buildHandlers (dictation)', () => {
  it('forwards start/stop to the dictation manager', async () => {
    const d = deps()
    const h = buildHandlers(d)
    expect(await h['dictation:start']('p1')).toEqual({ ok: true, value: null })
    await h['dictation:stop']('p1')
    expect(d.dictationCalls).toEqual(['start:p1', 'stop:p1'])
  })

  it('closing an agent panel stops its dictation', async () => {
    const d = deps()
    await buildHandlers(d)['agent:close']('p1')
    expect(d.dictationCalls).toEqual(['stop:p1'])
  })
})
