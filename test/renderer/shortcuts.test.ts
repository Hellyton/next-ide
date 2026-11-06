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

  it('Cmd+B toggles the sidebar', () => {
    expect(matchShortcut(ev({ key: 'b', code: 'KeyB' }))).toEqual({ kind: 'toggleSidebar' })
    expect(matchShortcut(ev({ key: 'B', code: 'KeyB', shiftKey: true }))).toBeNull()
  })

  it('Cmd+W closes', () => {
    expect(matchShortcut(ev({ key: 'w', code: 'KeyW' }))).toEqual({ kind: 'close' })
  })

  it('Cmd+1..9 focuses group', () => {
    expect(matchShortcut(ev({ key: '1', code: 'Digit1' }))).toEqual({ kind: 'focusGroup', index: 0 })
    expect(matchShortcut(ev({ key: '9', code: 'Digit9' }))).toEqual({ kind: 'focusGroup', index: 8 })
  })

  it('Cmd+P opens quick open, Cmd+Shift+P does not', () => {
    expect(matchShortcut(ev({ key: 'p', code: 'KeyP' }))).toEqual({ kind: 'quickOpen' })
    expect(matchShortcut(ev({ key: 'P', code: 'KeyP', shiftKey: true }))).toBeNull()
  })

  it('ignores without Cmd or with Ctrl/Alt', () => {
    expect(matchShortcut(ev({ key: 'w', metaKey: false }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', ctrlKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', altKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'k', code: 'KeyK' }))).toBeNull()
  })
})

describe('matchShortcut on Windows/Linux (Ctrl instead of Cmd)', () => {
  const win = (over: Partial<ShortcutEvent>): ShortcutEvent => ev({ metaKey: false, ctrlKey: true, ...over })
  it('uses Ctrl as the modifier and ignores Win/Super', () => {
    expect(matchShortcut(win({ key: 'w', code: 'KeyW' }), false)).toEqual({ kind: 'close' })
    expect(matchShortcut(win({ key: 'p', code: 'KeyP' }), false)).toEqual({ kind: 'quickOpen' })
    expect(matchShortcut(win({ key: '2', code: 'Digit2' }), false)).toEqual({ kind: 'focusGroup', index: 1 })
    expect(matchShortcut(ev({ key: 'w', code: 'KeyW' }), false)).toBeNull()
  })
  it('keeps plain Ctrl+B for the composer; Ctrl+Shift+B toggles the sidebar', () => {
    expect(matchShortcut(win({ key: 'b', code: 'KeyB' }), false)).toBeNull()
    expect(matchShortcut(win({ key: 'B', code: 'KeyB', shiftKey: true }), false)).toEqual({ kind: 'toggleSidebar' })
  })
})
