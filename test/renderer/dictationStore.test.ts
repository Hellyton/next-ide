import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.stubGlobal('window', { api: { invoke, on: vi.fn(() => () => undefined) } })

const { useDictation, STOP_TIMEOUT_MS } = await import('@renderer/stores/dictationStore')
const { useAgents } = await import('@renderer/stores/agentStore')

const reset = () => useDictation.setState({ active: null, stopping: false, status: null, snapshot: null, caret: 0 })

describe('dictationStore', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ ok: true, value: null })
    reset()
    useAgents.setState({ chats: {}, drafts: {}, notices: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('start records the panel and applies transcripts to its draft at the caret', async () => {
    useAgents.getState().setDraft('p1', 'olha:')
    await useDictation.getState().start('p1', 'olha:', 5)
    expect(invoke).toHaveBeenCalledWith('dictation:start', 'p1')
    expect(useDictation.getState().active).toBe('p1')
    useDictation.getState().handle('p1', { type: 'transcript', final: 'abre', volatile: ' o' })
    expect(useAgents.getState().drafts['p1']).toBe('olha: abre o')
    expect(useDictation.getState().caret).toBe(12)
  })

  it('ignores events for panels that are not recording', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p2', { type: 'transcript', final: 'x', volatile: '' })
    expect(useAgents.getState().drafts['p2']).toBeUndefined()
  })

  it('a failed start shows a notice and leaves recording mode', async () => {
    invoke.mockResolvedValue({ ok: false, message: 'Helper de ditado não encontrado' })
    await useDictation.getState().start('p1', '', 0)
    expect(useDictation.getState().active).toBeNull()
    expect(useAgents.getState().notices['p1']).toEqual({ text: 'Helper de ditado não encontrado', command: '' })
  })

  it('a rejected invoke also shows a notice', async () => {
    invoke.mockRejectedValue(new Error('ipc down'))
    await useDictation.getState().start('p1', '', 0)
    expect(useDictation.getState().active).toBeNull()
    expect(useAgents.getState().notices['p1']?.text).toContain('ipc down')
  })

  it('status shows until ready; error becomes a notice', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p1', { type: 'status', text: 'baixando modelo de fala…' })
    expect(useDictation.getState().status).toBe('baixando modelo de fala…')
    useDictation.getState().handle('p1', { type: 'ready' })
    expect(useDictation.getState().status).toBeNull()
    useDictation.getState().handle('p1', { type: 'error', message: 'Permissão negada' })
    expect(useAgents.getState().notices['p1']).toEqual({ text: 'Permissão negada', command: '' })
  })

  it('stop asks main to stop and resolves once ended arrives', async () => {
    await useDictation.getState().start('p1', '', 0)
    const done = useDictation.getState().stop()
    expect(useDictation.getState().stopping).toBe(true)
    expect(invoke).toHaveBeenCalledWith('dictation:stop', 'p1')
    useDictation.getState().handle('p1', { type: 'transcript', final: 'fim', volatile: '' })
    useDictation.getState().handle('p1', { type: 'ended' })
    await done
    expect(useDictation.getState()).toMatchObject({ active: null, stopping: false, snapshot: null })
    expect(useAgents.getState().drafts['p1']).toBe('fim')
  })

  it('stop gives up waiting after the timeout so the UI never stays stuck', async () => {
    vi.useFakeTimers()
    await useDictation.getState().start('p1', '', 0)
    const done = useDictation.getState().stop()
    vi.advanceTimersByTime(STOP_TIMEOUT_MS)
    await done
    expect(useDictation.getState().active).toBeNull()
  })

  it('ended without stop (helper crashed) leaves recording mode', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p1', { type: 'ended' })
    expect(useDictation.getState().active).toBeNull()
  })

  it('starting on another panel stops the first one first', async () => {
    await useDictation.getState().start('p1', '', 0)
    const second = useDictation.getState().start('p2', '', 0)
    useDictation.getState().handle('p1', { type: 'ended' })
    await second
    expect(invoke.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ['dictation:start', 'p1'],
      ['dictation:stop', 'p1'],
      ['dictation:start', 'p2'],
    ])
    expect(useDictation.getState().active).toBe('p2')
  })

  it('start on the panel already recording is a no-op', async () => {
    await useDictation.getState().start('p1', '', 0)
    await useDictation.getState().start('p1', '', 0)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stop with nothing recording resolves immediately', async () => {
    await useDictation.getState().stop()
    expect(invoke).not.toHaveBeenCalled()
  })
})
