/** Events the renderer gets on `dictation:event`. All but `ended` come from the helper's stdout; main adds `ended` when it exits. */
export type DictationEvent =
  | { type: 'ready' }
  | { type: 'status'; text: string }
  | { type: 'transcript'; final: string; volatile: string }
  | { type: 'error'; message: string }
  | { type: 'ended' }

/** Parses one stdout line of the Swift helper; anything malformed (or main-only) is null. */
export function parseDictationLine(line: string): DictationEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(line.trim())
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  switch (o.type) {
    case 'ready':
      return { type: 'ready' }
    case 'status':
      return typeof o.text === 'string' ? { type: 'status', text: o.text } : null
    case 'transcript':
      return typeof o.final === 'string' && typeof o.volatile === 'string' ? { type: 'transcript', final: o.final, volatile: o.volatile } : null
    case 'error':
      return typeof o.message === 'string' ? { type: 'error', message: o.message } : null
    default:
      return null
  }
}
