import { describe, expect, it } from 'vitest'
import { applyDictation, beginDictation } from '@renderer/agent/dictation'

describe('dictation text', () => {
  it('inserts at the caret with a separating space and keeps the suffix', () => {
    const s = beginDictation('olha: fim', 5)
    expect(applyDictation(s, 'abre o arquivo', '')).toEqual({ text: 'olha: abre o arquivo fim', caret: 20 })
  })

  it('no extra space when the prefix is empty or already ends in whitespace', () => {
    expect(applyDictation(beginDictation('', 0), 'oi', '')).toEqual({ text: 'oi', caret: 2 })
    expect(applyDictation(beginDictation('a\n', 2), 'oi', '')).toEqual({ text: 'a\noi', caret: 4 })
    expect(applyDictation(beginDictation('a ', 2), 'oi', '')).toEqual({ text: 'a oi', caret: 4 })
  })

  it('shows volatile text after final text', () => {
    const s = beginDictation('', 0)
    expect(applyDictation(s, 'abre o', ' arquivo').text).toBe('abre o arquivo')
    expect(applyDictation(s, '', 'abre').text).toBe('abre')
  })

  it('does not add a space before a suffix that already starts with whitespace', () => {
    const s = beginDictation('x y', 1)
    expect(applyDictation(s, 'oi', '')).toEqual({ text: 'x oi y', caret: 4 })
  })

  it('saying nothing restores the original text and caret exactly', () => {
    const s = beginDictation('olha', 4)
    expect(applyDictation(s, '', '')).toEqual({ text: 'olha', caret: 4 })
    expect(applyDictation(s, '', '   ')).toEqual({ text: 'olha', caret: 4 })
  })

  it('clamps an out-of-range caret', () => {
    expect(beginDictation('ab', 99).suffix).toBe('')
    expect(beginDictation('ab', -1).prefix).toBe('')
  })
})
