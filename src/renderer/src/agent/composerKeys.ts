export type ComposerKeyInput = { key: string; shiftKey: boolean; isComposing: boolean; text: string; busy: boolean; hasHistory: boolean }

/** Esc Esc (the CLI's shortcut for /rewind). */
export function isDoubleEscape(previous: number | null, now: number, windowMs = 500): boolean {
  return previous !== null && now - previous <= windowMs
}

/** Ctrl+B (the CLI's "run in background"); Cmd+B is left to the app. */
export function isBackgroundKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'b'
}

export function composerKeyAction(e: ComposerKeyInput): 'send' | 'interrupt' | 'history' | null {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) return 'send'
  if (e.key === 'Escape' && e.busy) return 'interrupt'
  if (e.key === 'ArrowUp' && e.text === '' && e.hasHistory) return 'history'
  return null
}
