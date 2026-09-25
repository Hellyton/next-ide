import type { AgentEvent, ContextUsage, RateWindow, SessionUsage, Usage } from '@shared/agent'
import type { PermissionMode } from '@shared/models'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const CATEGORY_KINDS = new Set(['used', 'free', 'buffer', 'deferred'])

/** Validates the SDK's getContextUsage() response down to what the /context modal shows. */
export function parseContextUsage(raw: unknown): ContextUsage | null {
  if (!isRec(raw) || !finite(raw.totalTokens) || !finite(raw.maxTokens) || raw.maxTokens <= 0) return null
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).flatMap((c) =>
    isRec(c) && typeof c.name === 'string' && finite(c.tokens) && typeof c.kind === 'string' && CATEGORY_KINDS.has(c.kind)
      ? [{ name: c.name, tokens: c.tokens, color: typeof c.color === 'string' ? c.color : '', kind: c.kind as ContextUsage['categories'][number]['kind'] }]
      : [],
  )
  const memoryFiles = (Array.isArray(raw.memoryFiles) ? raw.memoryFiles : []).flatMap((m) =>
    isRec(m) && typeof m.path === 'string' && finite(m.tokens) ? [{ path: m.path, tokens: m.tokens }] : [],
  )
  return {
    model: typeof raw.model === 'string' ? raw.model : '',
    totalTokens: raw.totalTokens,
    maxTokens: raw.maxTokens,
    percentage: finite(raw.percentage) ? raw.percentage : (raw.totalTokens / raw.maxTokens) * 100,
    categories,
    memoryFiles,
  }
}

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
 * Stream state is partitioned by stream owner (parent_tool_use_id ?? 'root') to prevent
 * corruption from interleaved streams.
 */
export class StreamNormalizer {
  private readonly streams = new Map<string, { messageId: string; blockKeys: Map<number, string> }>()
  private readonly pendingText = new Map<string, string[]>()
  private counter = 0
  /** Prompt size (input + cache read + cache creation) of the latest main-loop API call. */
  private contextTokens: number | undefined
  private contextModel: string | undefined

  push(message: unknown): AgentEvent[] {
    if (!isRec(message)) return []
    const parent = str(message.parent_tool_use_id)
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') return [this.init(message)]
        return this.task(message)
      case 'stream_event':
        return this.stream(message.event, parent)
      case 'assistant':
        return this.assistant(message.message, parent)
      case 'user':
        return this.toolResults(message.message)
      case 'result':
        return this.result(message)
      case 'rate_limit_event':
        return this.rateLimit(message.rate_limit_info)
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
      ...(str(m.claude_code_version) ? { version: str(m.claude_code_version)! } : {}),
    }
  }

  /** Plan usage windows (claude.ai subscriptions). `utilization` is a 0–1 fraction; `resetsAt` epoch seconds. */
  private rateLimit(info: unknown): AgentEvent[] {
    if (!isRec(info) || typeof info.utilization !== 'number') return []
    const window = info.rateLimitType
    if (window !== 'five_hour' && window !== 'seven_day') return []
    const usedPct = Math.round((info.utilization <= 1 ? info.utilization * 100 : info.utilization) * 10) / 10
    const reset = typeof info.resetsAt === 'number' ? (info.resetsAt > 1e12 ? Math.round(info.resetsAt / 1000) : info.resetsAt) : undefined
    return [{ kind: 'rate-limit', window, usedPct, ...(reset !== undefined ? { resetsAt: reset } : {}) }]
  }

  private stream(event: unknown, parent: string | undefined): AgentEvent[] {
    if (!isRec(event)) return []
    const index = num(event.index)
    const streamKey = parent ?? 'root'
    if (event.type === 'message_start' && isRec(event.message)) {
      const messageId = str(event.message.id) ?? ''
      this.streams.set(streamKey, { messageId, blockKeys: new Map() })
      return []
    }
    if (event.type === 'content_block_start' && isRec(event.content_block) && event.content_block.type === 'text') {
      const streamState = this.streams.get(streamKey)
      if (!streamState) return []
      const key = `${streamState.messageId}:${index}`
      streamState.blockKeys.set(index, key)
      this.pendingText.set(streamState.messageId, [...(this.pendingText.get(streamState.messageId) ?? []), key])
      return []
    }
    if (event.type === 'content_block_delta' && isRec(event.delta) && event.delta.type === 'text_delta') {
      const streamState = this.streams.get(streamKey)
      if (!streamState) return []
      const key = streamState.blockKeys.get(index)
      const text = str(event.delta.text)
      if (!key || !text) return []
      return [{ kind: 'text-delta', key, text, ...(parent ? { parentToolUseId: parent } : {}) }]
    }
    return []
  }

  private assistant(message: unknown, parent: string | undefined): AgentEvent[] {
    if (!isRec(message)) return []
    // Context in use = the prompt of the last main-loop call. `result.usage` sums every call of
    // the turn, so it overstates the context; subagent calls have their own context.
    if (!parent && isRec(message.usage)) {
      const u = message.usage
      this.contextTokens = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens)
      this.contextModel = str(message.model) ?? this.contextModel
    }
    if (!Array.isArray(message.content)) return []
    const id = str(message.id) ?? `msg-${++this.counter}`
    const withParent = parent ? { parentToolUseId: parent } : {}
    const out: AgentEvent[] = []
    for (const block of message.content) {
      if (!isRec(block)) continue
      if (block.type === 'text') {
        const queue = this.pendingText.get(id) ?? []
        const key = queue.shift() ?? `${id}:final:${++this.counter}`
        if (queue.length === 0) {
          this.pendingText.delete(id)
        } else {
          this.pendingText.set(id, queue)
        }
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
    const models = isRec(m.modelUsage) ? m.modelUsage : {}
    const ownModel = this.contextModel ? models[this.contextModel] : undefined
    const windowModel = isRec(ownModel) ? ownModel : Object.values(models).find(isRec)
    const contextWindow = windowModel ? num(windowModel.contextWindow) : 0
    const pct = contextWindow > 0 && this.contextTokens !== undefined ? Math.round((this.contextTokens / contextWindow) * 100) : undefined
    const events: AgentEvent[] = [
      {
        kind: 'stats',
        usage,
        costUsd: num(m.total_cost_usd),
        durationMs: num(m.duration_ms),
        ...(contextWindow > 0 ? { contextWindow } : {}),
        ...(pct !== undefined ? { contextPct: pct } : {}),
        ...(this.contextTokens !== undefined ? { contextTokens: this.contextTokens } : {}),
      },
    ]
    if (m.subtype !== 'success' || m.is_error === true) {
      const errors = Array.isArray(m.errors) ? m.errors.filter((e): e is string => typeof e === 'string') : []
      events.push({ kind: 'error', message: errors.join('\n') || str(m.result) || String(m.subtype ?? 'erro') })
    }
    return events
  }

  private task(m: Record<string, unknown>): AgentEvent[] {
    const id = str(m.task_id)
    if (!id) return []
    const toolUseId = str(m.tool_use_id)
    const description = typeof m.description === 'string' ? m.description : undefined
    if (m.subtype === 'task_started') {
      return [{ kind: 'task-started', id, description: description ?? 'Tarefa', ...(toolUseId ? { toolUseId } : {}) }]
    }
    if (m.subtype === 'task_progress') {
      const u = isRec(m.usage) ? m.usage : {}
      const lastToolName = str(m.last_tool_name)
      return [
        {
          kind: 'task-progress',
          id,
          ...(description ? { description } : {}),
          ...(lastToolName ? { lastToolName } : {}),
          totalTokens: finite(u.total_tokens) ? u.total_tokens : 0,
          toolUses: finite(u.tool_uses) ? u.tool_uses : 0,
          durationMs: finite(u.duration_ms) ? u.duration_ms : 0,
        },
      ]
    }
    if (m.subtype === 'task_notification') {
      const status = m.status
      if (status !== 'completed' && status !== 'failed' && status !== 'stopped') return []
      return [{ kind: 'task-done', id, status, summary: typeof m.summary === 'string' ? m.summary : '' }]
    }
    return []
  }
}

/** Maps the SDK's get_usage response to what the status line needs (`utilization` is 0-100 here). */
export function parseSessionUsage(response: unknown): SessionUsage | null {
  if (!isRec(response)) return null
  const session = isRec(response.session) ? response.session : {}
  const limits = isRec(response.rate_limits) ? response.rate_limits : {}
  const windowOf = (value: unknown): RateWindow | undefined => {
    if (!isRec(value) || typeof value.utilization !== 'number') return undefined
    const resets = typeof value.resets_at === 'string' ? Math.round(Date.parse(value.resets_at) / 1000) : NaN
    return {
      used_percentage: Math.round(value.utilization * 10) / 10,
      ...(Number.isFinite(resets) ? { resets_at: resets } : {}),
    }
  }
  const fiveHour = windowOf(limits.five_hour)
  const sevenDay = windowOf(limits.seven_day)
  return {
    totalCostUsd: num(session.total_cost_usd),
    totalDurationMs: num(session.total_duration_ms),
    totalLinesAdded: num(session.total_lines_added),
    totalLinesRemoved: num(session.total_lines_removed),
    rateLimits: { ...(fiveHour ? { five_hour: fiveHour } : {}), ...(sevenDay ? { seven_day: sevenDay } : {}) },
  }
}

/** Wrappers Claude Code stores as user messages for slash commands, hooks and reminders. */
const META_WRAPPERS = [
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<system-reminder>',
  '<user-prompt-submit-hook>',
]
const isMetaText = (text: string): boolean => {
  const t = text.trimStart()
  return META_WRAPPERS.some((tag) => t.startsWith(tag))
}

function userText(message: unknown): { text: string; images: number } | null {
  if (!isRec(message)) return null
  const content = message.content
  if (typeof content === 'string') return isMetaText(content) ? null : { text: content, images: 0 }
  if (!Array.isArray(content)) return null
  const texts = content.filter((b): b is Rec => isRec(b) && b.type === 'text').map((b) => str(b.text) ?? '')
  const images = content.filter((b) => isRec(b) && b.type === 'image').length
  const text = texts.join('\n')
  if ((!text && images === 0) || isMetaText(text)) return null
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
