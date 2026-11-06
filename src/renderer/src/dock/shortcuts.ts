import { isMac, isModOnly } from '../platform'

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
  | { kind: 'toggleSidebar' }

/**
 * Cmd+… on macOS, Ctrl+… on Windows/Linux. Off macOS the sidebar toggle is Ctrl+Shift+B, so plain
 * Ctrl+B keeps meaning the CLI's "run in background" in the composer.
 */
export function matchShortcut(e: ShortcutEvent, mac: boolean = isMac): DockCommand | null {
  if (!isModOnly(e, mac)) return null
  if (e.code === 'Backslash' || e.code === 'IntlBackslash') {
    return { kind: 'split', direction: e.shiftKey ? 'below' : 'right' }
  }
  if (!mac && e.shiftKey && e.key.toLowerCase() === 'b') return { kind: 'toggleSidebar' }
  if (e.shiftKey) return null
  if (e.key.toLowerCase() === 'w') return { kind: 'close' }
  if (e.key.toLowerCase() === 'p') return { kind: 'quickOpen' }
  if (mac && e.key.toLowerCase() === 'b') return { kind: 'toggleSidebar' }
  if (/^[1-9]$/.test(e.key)) return { kind: 'focusGroup', index: Number(e.key) - 1 }
  return null
}
