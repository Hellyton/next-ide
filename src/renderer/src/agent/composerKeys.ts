export type ComposerKeyInput = { key: string; shiftKey: boolean; isComposing: boolean; text: string; busy: boolean; hasHistory: boolean }

/** Esc Esc (the CLI's shortcut for /rewind). */
export function isDoubleEscape(previous: number | null, now: number, windowMs = 500): boolean {
  return previous !== null && now - previous <= windowMs
}

export function composerKeyAction(e: ComposerKeyInput): 'send' | 'interrupt' | 'history' | null {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) return 'send'
  if (e.key === 'Escape' && e.busy) return 'interrupt'
  if (e.key === 'ArrowUp' && e.text === '' && e.hasHistory) return 'history'
  return null
}
