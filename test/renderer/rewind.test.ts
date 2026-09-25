import { describe, expect, it, vi } from 'vitest'
import { rewindTargets, runRewind } from '@renderer/agent/rewind'
import type { ChatItem } from '@renderer/agent/chatReducer'
import type { AgentEvent, Outcome, RewindFiles } from '@shared/agent'

const items: ChatItem[] = [
  { type: 'user', id: 'u1', text: 'primeira', images: 0 },
  { type: 'text', key: 'k', text: 'resp', final: true },
  { type: 'user', id: '', text: 'sem id', images: 0 },
  { type: 'user', id: 'u2', text: 'segunda', images: 0 },
]

const ok = <T,>(value: T) => ({ ok: true as const, value })

function deps() {
  return {
    rewindFiles: vi.fn(async (): Promise<Outcome<RewindFiles>> => ok({ canRewind: true, filesChanged: [], insertions: 0, deletions: 0 })),
    forkBefore: vi.fn(async (): Promise<Outcome<{ sessionId: string | null; history: AgentEvent[] }>> => ok({ sessionId: 'f1', history: [] })),
    restart: vi.fn(async () => undefined),
    setDraft: vi.fn(),
  }
}

describe('rewindTargets', () => {
  it('lists user messages with an id, newest first', () => {
    expect(rewindTargets(items)).toEqual([{ id: 'u2', text: 'segunda' }, { id: 'u1', text: 'primeira' }])
  })
})

describe('runRewind', () => {
  const target = { id: 'u2', text: 'segunda' }
  it('both: restores files first, then forks the conversation and puts the prompt back', async () => {
    const d = deps()
    await runRewind('both', target, d)
    expect(d.rewindFiles).toHaveBeenCalledWith('u2')
    expect(d.forkBefore).toHaveBeenCalledWith('u2')
    expect(d.rewindFiles.mock.invocationCallOrder[0]).toBeLessThan(d.forkBefore.mock.invocationCallOrder[0]!)
    expect(d.restart).toHaveBeenCalledWith('f1', [])
    expect(d.setDraft).toHaveBeenCalledWith('segunda')
  })
  it('conversation: leaves files alone', async () => {
    const d = deps()
    await runRewind('conversation', target, d)
    expect(d.rewindFiles).not.toHaveBeenCalled()
    expect(d.restart).toHaveBeenCalled()
  })
  it('code: leaves the conversation alone', async () => {
    const d = deps()
    await runRewind('code', target, d)
    expect(d.forkBefore).not.toHaveBeenCalled()
    expect(d.restart).not.toHaveBeenCalled()
    expect(d.setDraft).not.toHaveBeenCalled()
  })
  it('stops with the SDK message when restoring files is refused', async () => {
    const d = deps()
    d.rewindFiles.mockResolvedValueOnce(ok({ canRewind: false, error: 'Sem checkpoint', filesChanged: [], insertions: 0, deletions: 0 }))
    await expect(runRewind('both', target, d)).rejects.toThrow('Sem checkpoint')
    expect(d.forkBefore).not.toHaveBeenCalled()
  })
  it('propagates fork failures', async () => {
    const d = deps()
    d.forkBefore.mockResolvedValueOnce({ ok: false, message: 'falhou' })
    await expect(runRewind('conversation', target, d)).rejects.toThrow('falhou')
  })
})
