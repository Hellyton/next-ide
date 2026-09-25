import { describe, expect, it } from 'vitest'
import { forkPointBefore } from '../../src/main/agent/rewind'

const H = [
  { type: 'user', uuid: 'u1' },
  { type: 'assistant', uuid: 'a1' },
  { type: 'system', subtype: 'x' },
  { type: 'user', uuid: 'u2' },
  { type: 'assistant', uuid: 'a2' },
]

describe('forkPointBefore', () => {
  it('returns the last entry with a uuid before the message', () => {
    expect(forkPointBefore(H, 'u2')).toBe('a1')
  })
  it('returns null for the first message (rewind to an empty conversation)', () => {
    expect(forkPointBefore(H, 'u1')).toBeNull()
  })
  it('throws when the message is not in the transcript', () => {
    expect(() => forkPointBefore(H, 'nope')).toThrow('Mensagem não encontrada no histórico da sessão.')
  })
})
