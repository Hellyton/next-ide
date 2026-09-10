import { describe, expect, it } from 'vitest'
import { matchShortcut, type ShortcutEvent } from '@renderer/dock/shortcuts'

const ev = (over: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: '',
  code: '',
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
})

describe('matchShortcut', () => {
  it('Cmd+\\ splits right, Cmd+Shift+\\ splits below (US and ABNT2)', () => {
    expect(matchShortcut(ev({ key: '\\', code: 'Backslash' }))).toEqual({ kind: 'split', direction: 'right' })
    expect(matchShortcut(ev({ key: '|', code: 'Backslash', shiftKey: true }))).toEqual({
      kind: 'split',
      direction: 'below',
    })
    expect(matchShortcut(ev({ key: '\\', code: 'IntlBackslash' }))).toEqual({ kind: 'split', direction: 'right' })
  })

  it('Cmd+W closes', () => {
    expect(matchShortcut(ev({ key: 'w', code: 'KeyW' }))).toEqual({ kind: 'close' })
  })

  it('Cmd+1..9 focuses group', () => {
    expect(matchShortcut(ev({ key: '1', code: 'Digit1' }))).toEqual({ kind: 'focusGroup', index: 0 })
    expect(matchShortcut(ev({ key: '9', code: 'Digit9' }))).toEqual({ kind: 'focusGroup', index: 8 })
  })

  it('ignores without Cmd or with Ctrl/Alt', () => {
    expect(matchShortcut(ev({ key: 'w', metaKey: false }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', ctrlKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', altKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'k', code: 'KeyK' }))).toBeNull()
  })
})
