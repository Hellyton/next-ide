import type { AgentEvent, Usage } from '@shared/agent'
import type { PermissionMode } from '@shared/models'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function flattenToolOutput(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (isRec(c) && c.type === 'text' ? (str(c.text) ?? '') : isRec(c) && c.type === 'image' ? '[imagem]' : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Converts raw SDK messages into AgentEvents. Stateful: text deltas are keyed by
 * `<messageId>:<blockIndex>` and the matching final `assistant` text block reuses that key.
 */
export class StreamNormalizer {
  private messageId = ''
  private readonly blockKeys = new Map<number, string>()
  private readonly pendingText = new Map<string, string[]>()
  private counter = 0

  push(message: unknown): AgentEvent[] {
    if (!isRec(message)) return []
    const parent = str(message.parent_tool_use_id)
    switch (message.type) {
      case 'system':
        return message.subtype === 'init' ? [this.init(message)] : []
      case 'stream_event':
        return this.stream(message.event, parent)
      case 'assistant':
        return this.assistant(message.message, parent)
      case 'user':
        return this.toolResults(message.message)
      case 'result':
        return this.result(message)
      default:
        return []
    }
  }

  private init(m: Rec): AgentEvent {
    return {
      kind: 'init',
      sessionId: str(m.session_id) ?? '',
      model: str(m.model) ?? '',
      cwd: str(m.cwd) ?? '',
      permissionMode: (str(m.permissionMode) ?? 'default') as PermissionMode,
      slashCommands: Array.isArray(m.slash_commands) ? m.slash_commands.filter((c): c is string => typeof c === 'string') : [],
    }
  }

  private stream(event: unknown, parent: string | undefined): AgentEvent[] {
    if (!isRec(event)) return []
    const index = num(event.index)
    if (event.type === 'message_start' && isRec(event.message)) {
      this.messageId = str(event.message.id) ?? this.messageId
      this.blockKeys.clear()
      return []
    }
    if (event.type === 'content_block_start' && isRec(event.content_block) && event.content_block.type === 'text') {
      const key = `${this.messageId}:${index}`
      this.blockKeys.set(index, key)
      this.pendingText.set(this.messageId, [...(this.pendingText.get(this.messageId) ?? []), key])
      return []
    }
    if (event.type === 'content_block_delta' && isRec(event.delta) && event.delta.type === 'text_delta') {
      const key = this.blockKeys.get(index)
      const text = str(event.delta.text)
      if (!key || !text) return []
      return [{ kind: 'text-delta', key, text, ...(parent ? { parentToolUseId: parent } : {}) }]
    }
    return []
  }

  private assistant(message: unknown, parent: string | undefined): AgentEvent[] {
    if (!isRec(message) || !Array.isArray(message.content)) return []
    const id = str(message.id) ?? `msg-${++this.counter}`
    const withParent = parent ? { parentToolUseId: parent } : {}
    const out: AgentEvent[] = []
    for (const block of message.content) {
      if (!isRec(block)) continue
      if (block.type === 'text') {
        const queue = this.pendingText.get(id) ?? []
        const key = queue.shift() ?? `${id}:final:${++this.counter}`
        this.pendingText.set(id, queue)
        out.push({ kind: 'text', key, text: str(block.text) ?? '', ...withParent })
      } else if (block.type === 'thinking') {
        const text = str(block.thinking) ?? ''
        if (text.trim()) out.push({ kind: 'thinking', key: `${id}:thinking:${++this.counter}`, text })
      } else if (block.type === 'tool_use') {
        out.push({ kind: 'tool-start', id: str(block.id) ?? '', name: str(block.name) ?? '', input: block.input, ...withParent })
      }
    }
    return out
  }

  private toolResults(message: unknown): AgentEvent[] {
    if (!isRec(message) || !Array.isArray(message.content)) return []
    return message.content.flatMap((b): AgentEvent[] =>
      isRec(b) && b.type === 'tool_result'
        ? [{ kind: 'tool-result', id: str(b.tool_use_id) ?? '', output: flattenToolOutput(b.content), isError: b.is_error === true }]
        : [],
    )
  }

  private result(m: Rec): AgentEvent[] {
    const u = isRec(m.usage) ? m.usage : {}
    const usage: Usage = {
      inputTokens: num(u.input_tokens),
      outputTokens: num(u.output_tokens),
      cacheReadTokens: num(u.cache_read_input_tokens),
      cacheCreationTokens: num(u.cache_creation_input_tokens),
    }
    const firstModel = isRec(m.modelUsage) ? Object.values(m.modelUsage).find(isRec) : undefined
    const contextWindow = firstModel ? num(firstModel.contextWindow) : 0
    const used = usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens
    const events: AgentEvent[] = [
      {
        kind: 'stats',
        usage,
        costUsd: num(m.total_cost_usd),
        durationMs: num(m.duration_ms),
        ...(contextWindow > 0 ? { contextWindow, contextPct: Math.round((used / contextWindow) * 100) } : {}),
      },
    ]
    if (m.subtype !== 'success' || m.is_error === true) {
      const errors = Array.isArray(m.errors) ? m.errors.filter((e): e is string => typeof e === 'string') : []
      events.push({ kind: 'error', message: errors.join('\n') || str(m.result) || String(m.subtype ?? 'erro') })
    }
    return events
  }
}

function userText(message: unknown): { text: string; images: number } | null {
  if (!isRec(message)) return null
  const content = message.content
  if (typeof content === 'string') return content.startsWith('<') ? null : { text: content, images: 0 }
  if (!Array.isArray(content)) return null
  const texts = content.filter((b): b is Rec => isRec(b) && b.type === 'text').map((b) => str(b.text) ?? '')
  const images = content.filter((b) => isRec(b) && b.type === 'image').length
  const text = texts.join('\n')
  if ((!text && images === 0) || text.startsWith('<')) return null
  return { text, images }
}

/** Rebuilds chat events from `getSessionMessages()` output (used by /resume and restored panels). */
export function historyToEvents(messages: unknown[]): AgentEvent[] {
  const normalizer = new StreamNormalizer()
  const out: AgentEvent[] = []
  for (const m of messages) {
    if (!isRec(m)) continue
    if (m.type === 'assistant') {
      out.push(...normalizer.push({ type: 'assistant', message: m.message, parent_tool_use_id: m.parent_tool_use_id ?? null }))
    } else if (m.type === 'user') {
      const prompt = userText(m.message)
      if (prompt) out.push({ kind: 'user', id: str(m.uuid) ?? '', text: prompt.text, images: prompt.images })
      out.push(...normalizer.push({ type: 'user', message: m.message }))
    }
  }
  return out
}
