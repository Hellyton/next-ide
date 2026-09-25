import { describe, expect, it } from 'vitest'
import { composerKeyAction, isBackgroundKey, isDoubleEscape } from '@renderer/agent/composerKeys'

const base = { key: 'a', shiftKey: false, isComposing: false, text: 'oi', busy: false, hasHistory: true }

describe('composerKeyAction', () => {
  it('Enter sends, Shift+Enter and IME composition do not', () => {
    expect(composerKeyAction({ ...base, key: 'Enter' })).toBe('send')
    expect(composerKeyAction({ ...base, key: 'Enter', shiftKey: true })).toBeNull()
    expect(composerKeyAction({ ...base, key: 'Enter', isComposing: true })).toBeNull()
  })
  it('Escape interrupts only while busy', () => {
    expect(composerKeyAction({ ...base, key: 'Escape', busy: true })).toBe('interrupt')
    expect(composerKeyAction({ ...base, key: 'Escape' })).toBeNull()
  })
  it('ArrowUp recalls history only with an empty input', () => {
    expect(composerKeyAction({ ...base, key: 'ArrowUp', text: '' })).toBe('history')
    expect(composerKeyAction({ ...base, key: 'ArrowUp' })).toBeNull()
    expect(composerKeyAction({ ...base, key: 'ArrowUp', text: '', hasHistory: false })).toBeNull()
  })
})

describe('isBackgroundKey', () => {
  it('is Ctrl+B only', () => {
    expect(isBackgroundKey({ key: 'b', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(isBackgroundKey({ key: 'B', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(isBackgroundKey({ key: 'b', ctrlKey: false, metaKey: true, altKey: false })).toBe(false)
    expect(isBackgroundKey({ key: 'b', ctrlKey: true, metaKey: true, altKey: false })).toBe(false)
    expect(isBackgroundKey({ key: 'x', ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
  })
})

describe('isDoubleEscape', () => {
  it('is true only for a second Esc within the window', () => {
    expect(isDoubleEscape(null, 1000)).toBe(false)
    expect(isDoubleEscape(1000, 1400)).toBe(true)
    expect(isDoubleEscape(1000, 1600)).toBe(false)
  })
})
