export type ShortcutEvent = {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type DockCommand =
  | { kind: 'split'; direction: 'right' | 'below' }
  | { kind: 'close' }
  | { kind: 'focusGroup'; index: number }
  | { kind: 'quickOpen' }

export function matchShortcut(e: ShortcutEvent): DockCommand | null {
  if (!e.metaKey || e.ctrlKey || e.altKey) return null
  if (e.code === 'Backslash' || e.code === 'IntlBackslash') {
    return { kind: 'split', direction: e.shiftKey ? 'below' : 'right' }
  }
  if (e.shiftKey) return null
  if (e.key.toLowerCase() === 'w') return { kind: 'close' }
  if (e.key.toLowerCase() === 'p') return { kind: 'quickOpen' }
  if (/^[1-9]$/.test(e.key)) return { kind: 'focusGroup', index: Number(e.key) - 1 }
  return null
}
