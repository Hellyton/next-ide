/** Where dictated text goes: the draft split at the caret when recording started. */
export type DictationSnapshot = { original: string; originalCaret: number; prefix: string; suffix: string }

export function beginDictation(text: string, caret: number): DictationSnapshot {
  const at = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, at)
  const prefix = before === '' || /\s$/.test(before) ? before : `${before} `
  return { original: text, originalCaret: at, prefix, suffix: text.slice(at) }
}

/** The draft with the transcript spliced in; nothing said yet → the untouched original. */
export function applyDictation(s: DictationSnapshot, final: string, volatile: string): { text: string; caret: number } {
  const spoken = `${final}${volatile}`.trim()
  if (!spoken) return { text: s.original, caret: s.originalCaret }
  const gap = s.suffix !== '' && !/^\s/.test(s.suffix) ? ' ' : ''
  const caret = s.prefix.length + spoken.length
  return { text: `${s.prefix}${spoken}${gap}${s.suffix}`, caret }
}
