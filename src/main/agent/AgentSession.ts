import { randomUUID } from 'node:crypto'
import type { AgentEvent, CommandOption, ImageAttachment, ModelOption, PermissionDecision, SessionUsage, SideAnswer } from '@shared/agent'
import type { EffortLevel, PermissionMode, SessionState } from '@shared/models'
import { AsyncQueue } from './AsyncQueue'
import { parseSessionUsage, StreamNormalizer } from './normalize'

export type UserMessageLike = { type: 'user'; message: { role: 'user'; content: unknown[] }; parent_tool_use_id: null }
export type PermissionResultLike =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string }
export type CanUseToolLike = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; suggestions?: unknown[]; title?: string },
) => Promise<PermissionResultLike>
export type QueryOptions = {
  cwd: string
  model?: string
  effort?: EffortLevel
  permissionMode: PermissionMode
  /**
   * Required by the SDK to PERMIT permissionMode 'bypassPermissions'; it does not itself turn
   * bypass on. Passed on every start so a later `setMode('bypassPermissions')` isn't rejected.
   */
  allowDangerouslySkipPermissions?: boolean
  resume?: string
  includePartialMessages: true
  canUseTool: CanUseToolLike
  settingSources: Array<'user' | 'project' | 'local'>
  abortController: AbortController
  pathToClaudeCodeExecutable?: string
  env?: Record<string, string>
}
export type QueryLike = AsyncIterable<unknown> & {
  interrupt(): Promise<unknown>
  setModel(model?: string): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  /** Live equivalent of the CLI's /effort. Absent on older SDKs/binaries. */
  applyFlagSettings?(settings: { effortLevel?: EffortLevel | null }): Promise<void>
  supportedCommands(): Promise<CommandOption[]>
  supportedModels(): Promise<ModelOption[]>
  /** Experimental in the SDK (name included), and absent on older Claude Code binaries. */
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?(opts?: { skipBehaviors?: boolean }): Promise<unknown>
  /** The CLI's /btw: undocumented in the SDK typings, and absent on older SDKs/binaries. */
  askSideQuestion?(question: string, opts?: { signal?: AbortSignal }): Promise<{ response: string } | null>
  close(): void
}
export type QueryFn = (params: { prompt: AsyncIterable<UserMessageLike>; options: QueryOptions }) => QueryLike

export type SessionConfig = { cwd: string; model?: string; effort?: EffortLevel; permissionMode: PermissionMode; resume?: string }
export type SessionDeps = {
  queryFn: QueryFn
  emit(event: AgentEvent): void
  claudePath?: string
  env?: Record<string, string>
  newId?: () => string
}

type Pending = { resolve(result: PermissionResultLike): void; input: Record<string, unknown>; suggestions?: unknown[]; dispose(): void }

type TextDelta = Extract<AgentEvent, { kind: 'text-delta' }>
const DELTA_BATCH_MS = 16

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isResult = (m: unknown): boolean => isRec(m) && m.type === 'result'
/** Main-loop message (no `parent_tool_use_id`) that means a turn is actively running. */
const isMainLoopActivity = (m: unknown): boolean => {
  if (!isRec(m) || m.parent_tool_use_id) return false
  if (m.type === 'assistant') return true
  return m.type === 'stream_event' && isRec(m.event) && m.event.type === 'message_start'
}

export class AgentSession {
  private query: QueryLike | null = null
  private input: AsyncQueue<UserMessageLike> | null = null
  private abort: AbortController | null = null
  private readonly pending = new Map<string, Pending>()
  private readonly normalizer = new StreamNormalizer()
  private state: SessionState = 'idle'
  private turnsInFlight = 0
  private closed = false
  private model?: string
  private effort?: EffortLevel
  private mode: PermissionMode
  private sessionId?: string
  private readonly newId: () => string
  private pendingDelta: TextDelta | null = null
  private deltaTimer: ReturnType<typeof setTimeout> | null = null
  private sideAbort: AbortController | null = null

  constructor(
    private readonly config: SessionConfig,
    private readonly deps: SessionDeps,
  ) {
    this.model = config.model
    this.effort = config.effort
    this.mode = config.permissionMode
    this.sessionId = config.resume
    this.newId = deps.newId ?? randomUUID
  }

  get currentState(): SessionState {
    return this.state
  }

  get isStarted(): boolean {
    return this.query !== null
  }

  start(): void {
    if (this.query || this.closed) return
    const input = new AsyncQueue<UserMessageLike>()
    const abort = new AbortController()
    const query = this.deps.queryFn({
      prompt: input,
      options: {
        cwd: this.config.cwd,
        permissionMode: this.mode,
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        settingSources: ['user', 'project', 'local'],
        abortController: abort,
        canUseTool: (toolName, toolInput, options) => this.canUseTool(toolName, toolInput, options),
        ...(this.model ? { model: this.model } : {}),
        ...(this.effort ? { effort: this.effort } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        ...(this.deps.claudePath ? { pathToClaudeCodeExecutable: this.deps.claudePath } : {}),
        ...(this.deps.env ? { env: this.deps.env } : {}),
      },
    })
    this.input = input
    this.abort = abort
    this.query = query
    this.emit({ kind: 'query-start' })
    void this.pump(query)
  }

  send(text: string, images: ImageAttachment[] = []): void {
    if (this.closed) return
    this.start()
    const content: unknown[] = [
      ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })),
      ...(text ? [{ type: 'text', text }] : []),
    ]
    this.emit({ kind: 'user', id: this.newId(), text, images: images.length })
    this.turnsInFlight++
    this.setState('running')
    this.input?.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })
  }

  async interrupt(): Promise<void> {
    await this.query?.interrupt()
  }

  /** Applies to the running query first; state and the event change only if the SDK accepted it. */
  async setModel(model: string): Promise<void> {
    if (this.query) await this.query.setModel(model)
    if (this.closed) return
    this.model = model
    this.emit({ kind: 'model', model })
  }

  /** Applies to the running query first; state and the event change only if the SDK accepted it. */
  async setMode(mode: PermissionMode): Promise<void> {
    if (this.query) await this.query.setPermissionMode(mode)
    if (this.closed) return
    this.mode = mode
    this.emit({ kind: 'mode', permissionMode: mode })
  }

  /** Live via applyFlagSettings (the CLI's /effort); always kept for the next query's `effort`. null = automatic. */
  async setEffort(effort: EffortLevel | null): Promise<void> {
    if (this.query) {
      if (!this.query.applyFlagSettings) throw new Error('Esforço não é suportado por esta versão do Claude Code.')
      await this.query.applyFlagSettings({ effortLevel: effort })
    }
    if (this.closed) return
    this.effort = effort ?? undefined
    this.emit({ kind: 'effort', effort })
  }

  async commands(): Promise<CommandOption[]> {
    this.start()
    return this.query ? this.query.supportedCommands() : []
  }

  async models(): Promise<ModelOption[]> {
    this.start()
    return this.query ? this.query.supportedModels() : []
  }

  /** Session cost/duration/lines and plan rate limits, for the status line. Null when unsupported. */
  async usage(): Promise<SessionUsage | null> {
    const query = this.query
    if (!query?.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET) return null
    try {
      // skipBehaviors: the behaviors section scans every transcript of the last 7 days.
      return parseSessionUsage(await query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }))
    } catch {
      return null
    }
  }

  /**
   * /btw: a quick tool-less answer from the session's context, even mid-turn. It never enters
   * the conversation history. A newer question cancels the one still in flight.
   */
  async btw(question: string): Promise<SideAnswer> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.askSideQuestion) return { ok: false, message: '/btw não é suportado por esta versão do Claude Code.' }
    this.sideAbort?.abort()
    const abort = new AbortController()
    this.sideAbort = abort
    try {
      const answer = await query.askSideQuestion(question, { signal: abort.signal })
      if (abort.signal.aborted) return { ok: false, message: 'Cancelado.' }
      return answer?.response ? { ok: true, text: answer.response } : { ok: false, message: 'Sem resposta.' }
    } catch (err) {
      if (abort.signal.aborted) return { ok: false, message: 'Cancelado.' }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      if (this.sideAbort === abort) this.sideAbort = null
    }
  }

  cancelBtw(): void {
    this.sideAbort?.abort()
  }

  respondPermission(requestId: string, decision: PermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    pending.dispose()
    pending.resolve(
      decision === 'deny'
        ? { behavior: 'deny', message: 'O usuário negou esta ação.' }
        : {
            behavior: 'allow',
            updatedInput: pending.input,
            ...(decision === 'allow-always' && pending.suggestions ? { updatedPermissions: pending.suggestions } : {}),
          },
    )
    this.emit({ kind: 'permission-resolved', requestId, decision })
    if (this.pending.size === 0) this.setState(this.turnsInFlight > 0 ? 'running' : 'idle')
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.sideAbort?.abort()
    for (const id of [...this.pending.keys()]) this.cancelPermission(id)
    this.input?.end()
    this.query?.close()
    this.abort?.abort()
    this.setState('exited')
  }

  private canUseTool(
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; suggestions?: unknown[]; title?: string },
  ): Promise<PermissionResultLike> {
    const requestId = this.newId()
    return new Promise((resolve) => {
      const onAbort = () => this.cancelPermission(requestId)
      options.signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(requestId, {
        resolve,
        input,
        ...(options.suggestions ? { suggestions: options.suggestions } : {}),
        dispose: () => options.signal.removeEventListener('abort', onAbort),
      })
      this.emit({
        kind: 'permission-request',
        requestId,
        toolName,
        input,
        canAlwaysAllow: Boolean(options.suggestions?.length),
        ...(options.title ? { title: options.title } : {}),
      })
      this.setState('awaiting_permission')
    })
  }

  private cancelPermission(requestId: string): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    pending.dispose()
    pending.resolve({ behavior: 'deny', message: 'Cancelado.' })
    this.emit({ kind: 'permission-resolved', requestId, decision: 'cancelled' })
  }

  private async pump(query: QueryLike): Promise<void> {
    try {
      for await (const message of query) {
        if (this.closed) return
        // A queued send may not have bumped `queued_turn_count` on the previous result (the CLI
        // hadn't read it yet), leaving the panel idle while the next turn's stream already runs.
        if (this.state === 'idle' && isMainLoopActivity(message)) {
          this.turnsInFlight = Math.max(this.turnsInFlight, 1)
          this.setState('running')
        }
        for (const event of this.normalizer.push(message)) {
          if (event.kind === 'init') this.sessionId = event.sessionId
          this.emit(event)
        }
        if (isResult(message)) {
          // Queued sends may coalesce into fewer turns, so a per-result decrement can get stuck
          // above zero; `queued_turn_count` is the SDK's own count of sends still pending.
          const queued = (message as { queued_turn_count?: unknown }).queued_turn_count
          this.turnsInFlight =
            typeof queued === 'number' && Number.isFinite(queued) ? Math.max(0, queued) : Math.max(0, this.turnsInFlight - 1)
          if (this.pending.size === 0) this.setState(this.turnsInFlight > 0 ? 'running' : 'idle')
        }
      }
      if (!this.closed) this.reset('idle')
    } catch (err) {
      if (this.closed) return
      this.emit({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      this.reset('error')
    }
  }

  /** Drops the dead query so the next send starts a fresh one resuming `sessionId`. */
  private reset(state: SessionState): void {
    for (const id of [...this.pending.keys()]) this.cancelPermission(id)
    this.input?.end()
    this.query = null
    this.input = null
    this.abort = null
    this.turnsInFlight = 0
    this.setState(state)
  }

  /**
   * All events go out through here. Consecutive text deltas for the same block are coalesced
   * for DELTA_BATCH_MS so long answers don't cost one IPC message + React render per token;
   * any other event flushes the pending delta first, so ordering is preserved.
   * (OutputBatcher only buffers one untyped string stream, so a keyed batcher lives here.)
   */
  private emit(event: AgentEvent): void {
    if (event.kind === 'text-delta') {
      this.queueDelta(event)
      return
    }
    this.flushDelta()
    this.emitNow(event)
  }

  private queueDelta(event: TextDelta): void {
    const pending = this.pendingDelta
    if (pending && pending.key === event.key && pending.parentToolUseId === event.parentToolUseId) {
      this.pendingDelta = { ...pending, text: pending.text + event.text }
      return
    }
    this.flushDelta()
    this.pendingDelta = { ...event }
    this.deltaTimer = setTimeout(() => this.flushDelta(), DELTA_BATCH_MS)
  }

  private flushDelta(): void {
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer)
      this.deltaTimer = null
    }
    const pending = this.pendingDelta
    if (!pending) return
    this.pendingDelta = null
    this.emitNow(pending)
  }

  private emitNow(event: AgentEvent): void {
    const deps = this.deps
    deps.emit(event)
  }

  private setState(state: SessionState): void {
    if (this.state === state) return
    this.state = state
    this.emit({ kind: 'status', state })
  }
}
