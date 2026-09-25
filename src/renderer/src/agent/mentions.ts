import { fuzzyFilter } from '@shared/fuzzy'

export type LineRange = { start: number; end: number }
export type AgentCandidate = { id: string; projectPath: string; visible: boolean }

export function formatMention(projectPath: string, filePath: string, range?: LineRange | null): string {
  const rel = filePath.startsWith(`${projectPath}/`) ? filePath.slice(projectPath.length + 1) : filePath
  if (!range) return `@${rel}`
  const a = Math.min(range.start, range.end)
  const b = Math.max(range.start, range.end)
  return `@${rel}#L${a}${b > a ? `-${b}` : ''}`
}

/** The `@token` that ends at the caret (token = run of non-whitespace starting with @). */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  let i = caret
  while (i > 0 && !/\s/.test(text[i - 1]!)) i--
  if (text[i] !== '@' || i === caret) return null
  return { query: text.slice(i + 1, caret), start: i }
}

/** Fuzzy-filtered @ mention candidates; empty once the token at `start` has been dismissed. */
export function mentionItems(
  mention: { query: string; start: number } | null,
  dismissedAt: number | null,
  index: string[] | undefined,
): string[] {
  if (!mention || mention.start === dismissedAt) return []
  return fuzzyFilter(mention.query, index ?? [], (s) => s, 8)
}

export const AGENT_PREFIX = 'agent-'

/** `@agent-<name>` candidates (the CLI's subagent mention); only once the token looks like `@ag…`. */
export function agentMentionItems(
  mention: { query: string; start: number } | null,
  dismissedAt: number | null,
  agents: string[] | undefined,
): string[] {
  if (!mention || mention.start === dismissedAt || !agents?.length) return []
  const q = mention.query
  if (q.length < 2 || !(q.startsWith(AGENT_PREFIX) || AGENT_PREFIX.startsWith(q))) return []
  const rest = q.startsWith(AGENT_PREFIX) ? q.slice(AGENT_PREFIX.length) : ''
  return fuzzyFilter(rest, agents, (s) => s, 8).map((name) => `${AGENT_PREFIX}${name}`)
}

export function applyMention(text: string, start: number, caret: number, rel: string): { text: string; caret: number } {
  const insert = `@${rel} `
  const rest = text.slice(caret).replace(/^\S*/, '').replace(/^ /, '')
  return { text: text.slice(0, start) + insert + rest, caret: start + insert.length }
}

export function appendSnippet(draft: string, snippet: string): string {
  if (!draft) return `${snippet} `
  return /\s$/.test(draft) ? `${draft}${snippet} ` : `${draft} ${snippet} `
}

export function pickAgentPanel(candidates: AgentCandidate[], projectPath: string, preferredId?: string): string | null {
  const same = candidates.filter((c) => c.projectPath === projectPath)
  return (same.find((c) => c.id === preferredId) ?? same.find((c) => c.visible) ?? same[0])?.id ?? null
}
