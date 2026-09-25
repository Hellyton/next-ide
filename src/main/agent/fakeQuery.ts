import { AsyncQueue } from './AsyncQueue'
import type { QueryFn, QueryLike, UserMessageLike } from './AgentSession'
import type { SessionStoreApi } from './sdk'

const textOf = (m: UserMessageLike): string =>
  m.message.content
    .map((b) => (typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .join('')

const queuedSends = (prompt: AsyncIterable<UserMessageLike>): number => {
  const size = (prompt as { size?: unknown }).size
  return typeof size === 'number' ? size : 0
}

/** Scripted stand-in for the SDK used by E2E (NEXT_IDE_FAKE_AGENT=1). No network, no subprocess. */
export const fakeQuery: QueryFn = ({ prompt, options }) => {
  const out = new AsyncQueue<unknown>()
  let model = options.model ?? 'fake-model'
  let turn = 0
  out.push({
    type: 'system',
    subtype: 'init',
    session_id: options.resume ?? 'fake-session',
    model,
    cwd: options.cwd,
    permissionMode: options.permissionMode,
    slash_commands: ['compact', 'review'],
    claude_code_version: '9.9.9-fake',
  })
  void (async () => {
    for await (const msg of prompt) {
      turn++
      const text = textOf(msg)
      const id = `fake_msg_${turn}`
      if (text.includes('permissão')) {
        const input = { command: 'rm -rf dist' }
        const result = await options.canUseTool('Bash', input, {
          signal: new AbortController().signal,
          suggestions: [{ type: 'addRules' }],
          title: 'Rodar rm -rf dist?',
        })
        const toolId = `fake_tool_${turn}`
        out.push({ type: 'assistant', parent_tool_use_id: null, message: { id, content: [{ type: 'tool_use', id: toolId, name: 'Bash', input }] } })
        out.push({
          type: 'user',
          parent_tool_use_id: null,
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: result.behavior === 'allow' ? 'removido' : 'negado', is_error: result.behavior !== 'allow' }] },
        })
      }
      if (text.includes('editar')) {
        const toolId = `fake_edit_${turn}`
        const input = { file_path: '/tmp/exemplo.ts', old_string: 'const a = 1', new_string: 'const a = 2' }
        out.push({ type: 'assistant', parent_tool_use_id: null, message: { id, content: [{ type: 'tool_use', id: toolId, name: 'Edit', input }] } })
        out.push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: 'ok' }] } })
      }
      if (text.includes('subagente')) {
        const taskId = `fake_task_${turn}`
        out.push({ type: 'assistant', parent_tool_use_id: null, message: { id, content: [{ type: 'tool_use', id: taskId, name: 'Task', input: { description: 'Explorar o projeto', prompt: 'explore' } }] } })
        out.push({ type: 'assistant', parent_tool_use_id: taskId, message: { id: `${id}_sub`, content: [{ type: 'text', text: 'Resposta do subagente' }] } })
        out.push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: taskId, content: 'feito' }] } })
      }
      const reply = `Você disse: ${text}`
      const half = Math.ceil(reply.length / 2)
      const textId = `${id}_text`
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: textId } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply.slice(0, half) } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply.slice(half) } } })
      out.push({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          id: textId,
          model,
          content: [{ type: 'text', text: reply }],
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      })
      out.push({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 42,
        // Cumulative within the query, like the real SDK.
        total_cost_usd: Number((0.01 * turn).toFixed(2)),
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        modelUsage: { [model]: { contextWindow: 200000 } },
        // Sends still waiting in the prompt queue, like the SDK's command-queue count.
        queued_turn_count: queuedSends(prompt),
      })
    }
    out.end()
  })()
  const query: QueryLike = Object.assign(out, {
    interrupt: async () => undefined,
    setModel: async (next?: string) => {
      model = next ?? model
    },
    setPermissionMode: async () => undefined,
    applyFlagSettings: async () => undefined,
    supportedCommands: async () => [
      { name: 'compact', description: 'Compacta a conversa', argumentHint: '' },
      { name: 'review', description: 'Revisa o código', argumentHint: '[pr]' },
    ],
    supportedModels: async () => [
      { value: 'fake-model', displayName: 'Fake Opus', description: '' },
      { value: 'fake-small', displayName: 'Fake Haiku', description: '' },
    ],
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => ({
      session: { total_cost_usd: 0.01, total_duration_ms: 3_600_000, total_api_duration_ms: 1000, total_lines_added: 12, total_lines_removed: 3, model_usage: {} },
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 42, resets_at: '2100-01-01T00:00:00.000Z' },
        seven_day: { utilization: 17, resets_at: '2100-01-02T00:00:00.000Z' },
      },
    }),
    askSideQuestion: async (question: string) => ({ response: `Resposta lateral: ${question}` }),
    close: () => out.end(),
  })
  return query
}

export const fakeSessions: SessionStoreApi = {
  list: async () => [{ sessionId: 'fake-old', title: 'Sessão antiga de teste', lastModified: Date.now() - 60_000 }],
  history: async () => [
    { type: 'user', uuid: 'h1', parent_tool_use_id: null, message: { role: 'user', content: 'pergunta antiga' } },
    { type: 'assistant', uuid: 'h2', parent_tool_use_id: null, message: { id: 'hm1', content: [{ type: 'text', text: 'resposta antiga' }] } },
  ],
}
