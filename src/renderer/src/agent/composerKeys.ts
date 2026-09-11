export type ComposerKeyInput = { key: string; shiftKey: boolean; isComposing: boolean; text: string; busy: boolean; hasHistory: boolean }

export function composerKeyAction(e: ComposerKeyInput): 'send' | 'interrupt' | 'history' | null {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) return 'send'
  if (e.key === 'Escape' && e.busy) return 'interrupt'
  if (e.key === 'ArrowUp' && e.text === '' && e.hasHistory) return 'history'
  return null
}
