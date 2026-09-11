import { randomUUID } from 'node:crypto'
import type { AgentEvent, CommandOption, ImageAttachment, ModelOption, PermissionDecision } from '@shared/agent'
import type { PermissionMode, SessionState } from '@shared/models'
import { AsyncQueue } from './AsyncQueue'
import { StreamNormalizer } from './normalize'

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
  permissionMode: PermissionMode
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
  supportedCommands(): Promise<CommandOption[]>
  supportedModels(): Promise<ModelOption[]>
  close(): void
}
export type QueryFn = (params: { prompt: AsyncIterable<UserMessageLike>; options: QueryOptions }) => QueryLike

export type SessionConfig = { cwd: string; model?: string; permissionMode: PermissionMode; resume?: string }
export type SessionDeps = {
  queryFn: QueryFn
  emit(event: AgentEvent): void
  claudePath?: string
  env?: Record<string, string>
  newId?: () => string
}

type Pending = { resolve(result: PermissionResultLike): void; input: Record<string, unknown>; suggestions?: unknown[] }

const isResult = (m: unknown): boolean => typeof m === 'object' && m !== null && (m as { type?: unknown }).type === 'result'

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
  private mode: PermissionMode
  private sessionId?: string
  private readonly newId: () => string

  constructor(
    private readonly config: SessionConfig,
    private readonly deps: SessionDeps,
  ) {
    this.model = config.model
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
        includePartialMessages: true,
        settingSources: ['user', 'project', 'local'],
        abortController: abort,
        canUseTool: (toolName, toolInput, options) => this.canUseTool(toolName, toolInput, options),
        ...(this.model ? { model: this.model } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        ...(this.deps.claudePath ? { pathToClaudeCodeExecutable: this.deps.claudePath } : {}),
        ...(this.deps.env ? { env: this.deps.env } : {}),
      },
    })
    this.input = input
    this.abort = abort
    this.query = query
    void this.pump(query)
  }

  send(text: string, images: ImageAttachment[] = []): void {
    if (this.closed) return
    this.start()
    const content: unknown[] = [
      ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })),
      ...(text ? [{ type: 'text', text }] : []),
    ]
    this.deps.emit({ kind: 'user', id: this.newId(), text, images: images.length })
    this.turnsInFlight++
    this.setState('running')
    this.input?.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })
  }

  async interrupt(): Promise<void> {
    await this.query?.interrupt()
  }

  async setModel(model: string): Promise<void> {
    this.model = model
    if (this.query) await this.query.setModel(model)
    this.deps.emit({ kind: 'model', model })
  }

  async setMode(mode: PermissionMode): Promise<void> {
    this.mode = mode
    if (this.query) await this.query.setPermissionMode(mode)
    this.deps.emit({ kind: 'mode', permissionMode: mode })
  }

  async commands(): Promise<CommandOption[]> {
    this.start()
    return this.query ? this.query.supportedCommands() : []
  }

  async models(): Promise<ModelOption[]> {
    this.start()
    return this.query ? this.query.supportedModels() : []
  }

  respondPermission(requestId: string, decision: PermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    pending.resolve(
      decision === 'deny'
        ? { behavior: 'deny', message: 'O usuário negou esta ação.' }
        : {
            behavior: 'allow',
            updatedInput: pending.input,
            ...(decision === 'allow-always' && pending.suggestions ? { updatedPermissions: pending.suggestions } : {}),
          },
    )
    this.deps.emit({ kind: 'permission-resolved', requestId, decision })
    if (this.pending.size === 0) this.setState(this.turnsInFlight > 0 ? 'running' : 'idle')
  }

  close(): void {
    if (this.closed) return
    this.closed = true
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
      this.pending.set(requestId, { resolve, input, ...(options.suggestions ? { suggestions: options.suggestions } : {}) })
      options.signal.addEventListener('abort', () => this.cancelPermission(requestId), { once: true })
      this.deps.emit({
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
    pending.resolve({ behavior: 'deny', message: 'Cancelado.' })
    this.deps.emit({ kind: 'permission-resolved', requestId, decision: 'cancelled' })
  }

  private async pump(query: QueryLike): Promise<void> {
    try {
      for await (const message of query) {
        for (const event of this.normalizer.push(message)) {
          if (event.kind === 'init') this.sessionId = event.sessionId
          this.deps.emit(event)
        }
        if (isResult(message)) {
          this.turnsInFlight = Math.max(0, this.turnsInFlight - 1)
          if (this.pending.size === 0) this.setState(this.turnsInFlight > 0 ? 'running' : 'idle')
        }
      }
      if (!this.closed) this.reset('idle')
    } catch (err) {
      if (this.closed) return
      this.deps.emit({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
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

  private setState(state: SessionState): void {
    if (this.state === state) return
    this.state = state
    this.deps.emit({ kind: 'status', state })
  }
}
