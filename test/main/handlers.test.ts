import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { DEFAULT_SETTINGS } from '@shared/models'
import { AgentManager } from '../../src/main/agent/AgentManager'
import { fakeQuery, fakeSessions } from '../../src/main/agent/fakeQuery'
import { buildHandlers, type HandlerDeps } from '../../src/main/ipc/handlers'
import { createStores } from '../../src/main/store/stores'

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps & { ptyCalls: unknown[][]; agentEvents: Array<[string, AgentEvent]> } {
  const ptyCalls: unknown[][] = []
  const agentEvents: Array<[string, AgentEvent]> = []
  return {
    stores: createStores(mkdtempSync(join(tmpdir(), 'handlers-'))),
    pty: {
      create: (...a) => void ptyCalls.push(['create', ...a]),
      write: (...a) => void ptyCalls.push(['write', ...a]),
      resize: (...a) => void ptyCalls.push(['resize', ...a]),
      kill: (...a) => void ptyCalls.push(['kill', ...a]),
    },
    pickFolder: async () => '/picked',
    pickWorkspaceFile: async () => null,
    readTextFile: async () => '{}',
    gitInfo: async () => ({ branch: 'dev' }),
    agents: new AgentManager({ emit: (id, e) => agentEvents.push([id, e]), runtime: () => ({ queryFn: fakeQuery }) }),
    sessions: fakeSessions,
    agentReady: async () => undefined,
    ptyCalls,
    agentEvents,
    ...over,
  }
}

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

  it('agent:history converts stored messages into events', async () => {
    const events = await buildHandlers(deps())['agent:history']('/proj', 'fake-old')
    expect(events.map((e) => e.kind)).toEqual(['user', 'text'])
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
    expect(create).toHaveBeenCalledWith('p1', { type: 'agent', projectPath: '/p' })
  })
})
