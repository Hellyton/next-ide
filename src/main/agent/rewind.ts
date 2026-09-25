const uuidOf = (m: unknown): string | undefined => {
  if (typeof m !== 'object' || m === null) return undefined
  const uuid = (m as { uuid?: unknown }).uuid
  return typeof uuid === 'string' && uuid ? uuid : undefined
}

/**
 * Where to fork a transcript so the conversation ends right before `userMessageId` (the CLI's
 * /rewind of the conversation). null: the message opens the session, nothing is kept.
 */
export function forkPointBefore(history: unknown[], userMessageId: string): string | null {
  const index = history.findIndex((m) => uuidOf(m) === userMessageId)
  if (index < 0) throw new Error('Mensagem não encontrada no histórico da sessão.')
  for (let i = index - 1; i >= 0; i--) {
    const uuid = uuidOf(history[i])
    if (uuid) return uuid
  }
  return null
}
