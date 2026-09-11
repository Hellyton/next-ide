# next-ide — Plano 2: Painel Agente (Claude Agent SDK)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder do painel de agente por um chat próprio sobre o Claude Agent SDK: streaming, cartões de ferramentas (Bash, diff de edição, Todo, subagentes), permissões inline, modelo/modo, comandos `/`, `/resume`, imagens coladas, statusline e confirmação ao fechar.

**Architecture:** O main process roda uma `AgentSession` por painel sobre `query()` do SDK (streaming input via `AsyncQueue`), apontando para o binário `claude` instalado. Um `StreamNormalizer` puro converte mensagens do SDK em `AgentEvent`s (`src/shared/agent.ts`), enviados ao renderer por `agent:event`. No renderer, um reducer puro (`reduceChat`) monta o estado do chat por painel; componentes React só renderizam esse estado. E2E usa um `fakeQuery` roteirizado (`NEXT_IDE_FAKE_AGENT=1`); o SDK real é exercitado por um smoke opcional.

**Tech Stack:** Base do Plano 1 + `@anthropic-ai/claude-agent-sdk@0.3.268` (runtime), `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `diff@9.0.0` (tipos embutidos).

**Spec:** `docs/superpowers/specs/2026-09-10-next-ide-mvp-design.md` (§6 Painel Agente, §8 fechar com confirmação, §11 IPC, §12 restauração, §13 erros)

## Global Constraints

- Tudo do Plano 1 continua valendo: renderer sandboxed (`contextIsolation`, `sandbox`, sem `nodeIntegration`), renderer só fala com main via `window.api`, preload expõe só canais listados em `INVOKE_CHANNELS`/`EVENT_CHANNELS`, `CONTRACT_COMPLETE` precisa continuar `true`.
- `@anthropic-ai/claude-agent-sdk` e `node-pty` são as únicas `dependencies`; o resto em `devDependencies`.
- O SDK é ESM: o main carrega com `await import('@anthropic-ai/claude-agent-sdk')` dentro de `src/main/agent/sdk.ts` (único arquivo que importa o SDK). Testes nunca importam o SDK, `electron` nem `node-pty`.
- O renderer nunca importa tipos do SDK; só `@shared/agent`.
- Binário: `Settings.claudePath` → senão `~/.local/bin/claude` se existir → senão `command -v claude` no shell de login. PATH do shell de login é resolvido uma vez no startup e usado pelo SDK, git e pty.
- `settingSources: ['user', 'project', 'local']` (herda skills, hooks, MCP, CLAUDE.md do usuário).
- Textos de UI em pt-BR; código, identificadores e comentários em inglês.
- E2E usa `NEXT_IDE_FAKE_AGENT=1` (sem chamadas reais). Smoke real só com `NEXT_IDE_REAL_AGENT=1`.
- Todo commit termina com:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DsUojN9FpXJWNDWbykQTCs
  ```

## Fatos verificados do SDK 0.3.268 (usar exatamente)

- `query({ prompt: AsyncIterable<SDKUserMessage>, options })` retorna `Query` (AsyncGenerator de mensagens) com `interrupt()`, `setModel(model?)`, `setPermissionMode(mode)`, `supportedCommands(): Promise<{ name, description, argumentHint }[]>`, `supportedModels(): Promise<{ value, displayName, description }[]>`, `close()`.
- Options usadas: `cwd`, `model`, `permissionMode`, `resume`, `includePartialMessages`, `canUseTool`, `pathToClaudeCodeExecutable`, `env`, `settingSources`, `abortController`.
- `SDKUserMessage = { type: 'user'; message: MessageParam; parent_tool_use_id: string | null }` (sem `session_id` obrigatório).
- `canUseTool(toolName, input, { signal, suggestions?, title?, displayName?, decisionReason? })` → `{ behavior: 'allow', updatedInput?, updatedPermissions? } | { behavior: 'deny', message }`.
- `listSessions({ dir })` → `{ sessionId, summary, lastModified, customTitle?, firstPrompt? }[]`; `getSessionMessages(sessionId, { dir })` → `{ type: 'user'|'assistant'|'system', uuid, message, parent_tool_use_id }[]`.
- Stream real gravado (haiku, Read em arquivo): `system/init` (session_id, model, cwd, permissionMode, slash_commands); por mensagem, `stream_event` `message_start` (id) → `content_block_start` (thinking | text | tool_use, com `index`) → `content_block_delta` (`text_delta` / `thinking_delta` vazio / `input_json_delta`) → `content_block_stop`; mensagens `assistant` chegam **uma por bloco**, com o mesmo `message.id`; `user` traz `tool_result` (`tool_use_id`, `content` string); `result` traz `total_cost_usd`, `duration_ms`, `usage`, `modelUsage[model].contextWindow`. Blocos de thinking chegam com texto vazio.

## File Structure

```
build/csp.ts                         CSP de produção + injectCsp(html)
src/shared/agent.ts                  AgentEvent, ImageAttachment, Usage, opções, SessionSummary
src/shared/ipc-contract.ts           (modificar) canais agent:*, statusline:run, evento agent:event
src/main/agent/AsyncQueue.ts         fila async iterável (prompt do SDK)
src/main/agent/normalize.ts          StreamNormalizer, historyToEvents, flattenToolOutput
src/main/agent/AgentSession.ts       uma sessão por painel (query, fila, permissões, estado)
src/main/agent/AgentManager.ts       Map<panelId, AgentSession>
src/main/agent/sdk.ts                import dinâmico do SDK real → QueryFn + histórico
src/main/agent/fakeQuery.ts          QueryFn roteirizada para E2E
src/main/env/loginShell.ts           PATH do shell de login + resolveClaudePath
src/main/statusline/runStatusLine.ts executa statusLine.command do ~/.claude/settings.json
src/renderer/src/agent/chatReducer.ts   ChatState + reduceChat (puro)
src/renderer/src/agent/diffLines.ts     linhas de diff para cartões Edit/Write (puro)
src/renderer/src/agent/slash.ts         filtro/merge de comandos / (puro)
src/renderer/src/agent/images.ts        validação e leitura de imagens (puro + FileReader)
src/renderer/src/stores/agentStore.ts   chats por painel + assinatura agent:event
src/renderer/src/panels/agent/AgentPanel.tsx   (substitui AgentStubPanel)
src/renderer/src/panels/agent/ChatView.tsx
src/renderer/src/panels/agent/Composer.tsx
src/renderer/src/panels/agent/StatusLine.tsx
src/renderer/src/panels/agent/ResumeModal.tsx
src/renderer/src/panels/agent/cards/*.tsx      Text, Thinking, Tool (Bash, Edit, Todo, Task, Generic), Permission, User, Error
test/fixtures/stream-read.jsonl       stream real reduzido
test/... (Vitest)   e2e/agent*.spec.ts (Playwright)
```

---

### Task 1: Dependências, CSP de produção, tipos do agente e AsyncQueue

**Files:**
- Modify: `package.json` (deps), `electron.vite.config.ts`, `tsconfig.json` (incluir `build`)
- Create: `build/csp.ts`, `src/shared/agent.ts`, `src/main/agent/AsyncQueue.ts`
- Test: `test/build/csp.test.ts`, `test/main/AsyncQueue.test.ts`

**Interfaces:**
- Produces: `PRODUCTION_CSP: string`, `injectCsp(html: string): string`; tipos de `@shared/agent` (abaixo); `class AsyncQueue<T> implements AsyncIterable<T> { push(item: T): void; end(): void; readonly size: number }`.

- [ ] **Step 1: Instalar dependências**

```bash
npm install -E @anthropic-ai/claude-agent-sdk@0.3.268
npm install -D -E react-markdown@10.1.0 remark-gfm@4.0.1 diff@9.0.0
```

Expected: `package.json` `dependencies` = `node-pty` + `@anthropic-ai/claude-agent-sdk`. Se o `postinstall` do Plano 1 rodar, ok.

- [ ] **Step 2: Testes falhando**

```ts
// test/build/csp.test.ts
import { describe, expect, it } from 'vitest'
import { PRODUCTION_CSP, injectCsp } from '../../build/csp'

describe('injectCsp', () => {
  it('adds the CSP meta right after <head>', () => {
    const out = injectCsp('<html><head><title>x</title></head></html>')
    expect(out).toContain(`<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`)
  })

  it('blocks remote scripts and objects', () => {
    expect(PRODUCTION_CSP).toContain("script-src 'self'")
    expect(PRODUCTION_CSP).toContain("object-src 'none'")
    expect(PRODUCTION_CSP).not.toContain('unsafe-eval')
  })
})
```

```ts
// test/main/AsyncQueue.test.ts
import { describe, expect, it } from 'vitest'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'

describe('AsyncQueue', () => {
  it('yields pushed items in order, including items pushed while waiting', async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    const seen: number[] = []
    const done = (async () => {
      for await (const n of q) seen.push(n)
    })()
    q.push(2)
    await Promise.resolve()
    q.push(3)
    q.end()
    await done
    expect(seen).toEqual([1, 2, 3])
  })

  it('ignores pushes after end and reports size', () => {
    const q = new AsyncQueue<string>()
    q.push('a')
    expect(q.size).toBe(1)
    q.end()
    q.push('b')
    expect(q.size).toBe(1)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run test/build/csp.test.ts test/main/AsyncQueue.test.ts` → FAIL (imports).

- [ ] **Step 4: Implementar**

```ts
// build/csp.ts
// Production-only CSP: dev (Vite HMR) needs inline scripts, so this is injected at build time.
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

export function injectCsp(html: string): string {
  return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`)
}
```

```ts
// electron.vite.config.ts — adicionar o plugin ao renderer
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { injectCsp } from './build/csp'

const shared = { '@shared': resolve('src/shared') }

function productionCsp(): Plugin {
  return { name: 'next-ide-csp', apply: 'build', transformIndexHtml: (html) => injectCsp(html) }
}

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss(), productionCsp()],
  },
})
```

Em `tsconfig.json`, acrescentar `"build"` ao array `include`.

```ts
// src/shared/agent.ts
import type { PermissionMode, SessionState } from './models'

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
export type ImageAttachment = { name: string; mediaType: ImageMediaType; data: string /* base64, no data: prefix */ }

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }

export type StatsEvent = {
  kind: 'stats'
  usage: Usage
  costUsd: number
  durationMs: number
  contextWindow?: number
  contextPct?: number
}

export type PermissionDecision = 'allow' | 'allow-always' | 'deny'

export type AgentEvent =
  | { kind: 'status'; state: SessionState }
  | { kind: 'init'; sessionId: string; model: string; cwd: string; permissionMode: PermissionMode; slashCommands: string[] }
  | { kind: 'user'; id: string; text: string; images: number }
  | { kind: 'text-delta'; key: string; text: string; parentToolUseId?: string }
  | { kind: 'text'; key: string; text: string; parentToolUseId?: string }
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'tool-start'; id: string; name: string; input: unknown; parentToolUseId?: string }
  | { kind: 'tool-result'; id: string; output: string; isError: boolean }
  | { kind: 'permission-request'; requestId: string; toolName: string; input: unknown; title?: string; canAlwaysAllow: boolean }
  | { kind: 'permission-resolved'; requestId: string; decision: PermissionDecision | 'cancelled' }
  | { kind: 'mode'; permissionMode: PermissionMode }
  | { kind: 'model'; model: string }
  | StatsEvent
  | { kind: 'error'; message: string }

export type CommandOption = { name: string; description: string; argumentHint: string }
export type ModelOption = { value: string; displayName: string; description: string }
export type SessionSummary = { sessionId: string; title: string; lastModified: number }

/** Subset of Claude Code's statusLine JSON input that next-ide can provide. */
export type StatusLineInput = {
  session_id: string
  cwd: string
  model: { id: string; display_name: string }
  workspace: { current_dir: string; project_dir: string }
  cost: { total_cost_usd: number; total_duration_ms: number }
  context_window?: { context_window_size: number; used_percentage: number; total_input_tokens: number }
}
```

```ts
// src/main/agent/AsyncQueue.ts
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = []
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = []
  private ended = false

  get size(): number {
    return this.items.length
  }

  push(item: T): void {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: item, done: false })
    else this.items.push(item)
  }

  end(): void {
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) return Promise.resolve({ value: this.items.shift() as T, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}
```

- [ ] **Step 5: Verificar** — `npx vitest run test/build/csp.test.ts test/main/AsyncQueue.test.ts && npm run typecheck && npm run build && grep -c "Content-Security-Policy" out/renderer/index.html` → testes verdes, typecheck limpo, `1`. Rodar `npm run test:e2e` (tudo do Plano 1 continua verde com CSP).

- [ ] **Step 6: Commit** — `git add package.json package-lock.json electron.vite.config.ts tsconfig.json build src/shared/agent.ts src/main/agent/AsyncQueue.ts test/build test/main/AsyncQueue.test.ts && git commit -m "feat: add agent types, async queue and production CSP"`

---

### Task 2: StreamNormalizer e histórico (SDK → AgentEvent)

**Files:**
- Create: `src/main/agent/normalize.ts`, `test/fixtures/stream-read.jsonl`
- Test: `test/main/normalize.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `Usage` (Task 1).
- Produces: `class StreamNormalizer { push(message: unknown): AgentEvent[] }`, `historyToEvents(messages: unknown[]): AgentEvent[]`, `flattenToolOutput(content: unknown): string`.

- [ ] **Step 1: Criar a fixture (stream real reduzido)**

```jsonl
{"type":"system","subtype":"init","session_id":"sess-1","model":"claude-haiku-4-5-20251001","cwd":"/tmp/fixture","permissionMode":"default","slash_commands":["compact","review"]}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"message_start","message":{"id":"msg_A"}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_stop","index":0}}
{"type":"assistant","parent_tool_use_id":null,"message":{"id":"msg_A","content":[{"type":"thinking","thinking":""}]}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"Read","input":{}}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\": \"/tmp/fixture/hello.txt\"}"}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_stop","index":1}}
{"type":"assistant","parent_tool_use_id":null,"message":{"id":"msg_A","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"/tmp/fixture/hello.txt"}}]}}
{"type":"user","parent_tool_use_id":null,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"1\thello next-ide\n2\t"}]}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"message_start","message":{"id":"msg_B"}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_stop","index":0}}
{"type":"assistant","parent_tool_use_id":null,"message":{"id":"msg_B","content":[{"type":"thinking","thinking":""}]}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hello "}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"next-ide"}}}
{"type":"stream_event","parent_tool_use_id":null,"event":{"type":"content_block_stop","index":1}}
{"type":"assistant","parent_tool_use_id":null,"message":{"id":"msg_B","content":[{"type":"text","text":"hello next-ide"}]}}
{"type":"rate_limit_event"}
{"type":"result","subtype":"success","is_error":false,"duration_ms":3242,"total_cost_usd":0.0221112,"usage":{"input_tokens":18,"output_tokens":212,"cache_read_input_tokens":34522,"cache_creation_input_tokens":8306},"modelUsage":{"claude-haiku-4-5-20251001":{"contextWindow":200000}},"result":"hello next-ide","session_id":"sess-1"}
```

- [ ] **Step 2: Testes falhando**

```ts
// test/main/normalize.test.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { StreamNormalizer, flattenToolOutput, historyToEvents } from '../../src/main/agent/normalize'

const fixture = readFileSync(join(__dirname, '../fixtures/stream-read.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as unknown)

function run(messages: unknown[]): AgentEvent[] {
  const n = new StreamNormalizer()
  return messages.flatMap((m) => n.push(m))
}

describe('StreamNormalizer (recorded stream)', () => {
  const events = run(fixture)

  it('emits init with session, model, cwd, mode and commands', () => {
    expect(events[0]).toEqual({
      kind: 'init',
      sessionId: 'sess-1',
      model: 'claude-haiku-4-5-20251001',
      cwd: '/tmp/fixture',
      permissionMode: 'default',
      slashCommands: ['compact', 'review'],
    })
  })

  it('streams text deltas under the same key as the final text', () => {
    const deltas = events.filter((e) => e.kind === 'text-delta')
    const finals = events.filter((e) => e.kind === 'text')
    expect(deltas.map((d) => d.kind === 'text-delta' && d.text)).toEqual(['hello ', 'next-ide'])
    expect(finals).toEqual([{ kind: 'text', key: 'msg_B:1', text: 'hello next-ide' }])
    expect(deltas.every((d) => d.kind === 'text-delta' && d.key === 'msg_B:1')).toBe(true)
  })

  it('maps tool use and tool result, skips empty thinking and unknown messages', () => {
    expect(events).toContainEqual({ kind: 'tool-start', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/fixture/hello.txt' } })
    expect(events).toContainEqual({ kind: 'tool-result', id: 'toolu_1', output: '1\thello next-ide\n2\t', isError: false })
    expect(events.some((e) => e.kind === 'thinking')).toBe(false)
  })

  it('emits stats with cost, duration and context percentage', () => {
    expect(events.at(-1)).toEqual({
      kind: 'stats',
      usage: { inputTokens: 18, outputTokens: 212, cacheReadTokens: 34522, cacheCreationTokens: 8306 },
      costUsd: 0.0221112,
      durationMs: 3242,
      contextWindow: 200000,
      contextPct: 21,
    })
  })
})

describe('StreamNormalizer (edge cases)', () => {
  it('emits non-empty thinking and passes parentToolUseId through', () => {
    const out = run([
      { type: 'assistant', parent_tool_use_id: 'task_1', message: { id: 'm', content: [{ type: 'thinking', thinking: 'plan' }, { type: 'text', text: 'hi' }] } },
    ])
    expect(out[0]).toMatchObject({ kind: 'thinking', text: 'plan' })
    expect(out[1]).toMatchObject({ kind: 'text', text: 'hi', parentToolUseId: 'task_1' })
  })

  it('emits an error after stats for failed results', () => {
    const out = run([{ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'], usage: {}, total_cost_usd: 0, duration_ms: 1 }])
    expect(out.map((e) => e.kind)).toEqual(['stats', 'error'])
    expect(out[1]).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('flattenToolOutput', () => {
  it('handles strings, text blocks and images', () => {
    expect(flattenToolOutput('x')).toBe('x')
    expect(flattenToolOutput([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\n[imagem]\nb')
    expect(flattenToolOutput(undefined)).toBe('')
  })
})

describe('historyToEvents', () => {
  it('rebuilds user prompts, assistant text and tool results; hides meta user messages', () => {
    const out = historyToEvents([
      { type: 'user', uuid: 'u1', parent_tool_use_id: null, message: { role: 'user', content: 'leia o arquivo' } },
      { type: 'user', uuid: 'u0', parent_tool_use_id: null, message: { role: 'user', content: '<command-name>/clear</command-name>' } },
      { type: 'assistant', uuid: 'a1', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] } },
      { type: 'user', uuid: 'u2', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
      { type: 'assistant', uuid: 'a2', parent_tool_use_id: null, message: { id: 'm2', content: [{ type: 'text', text: 'pronto' }] } },
      { type: 'user', uuid: 'u3', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text: 'veja' }, { type: 'image', source: {} }] } },
    ])
    expect(out.map((e) => e.kind)).toEqual(['user', 'tool-start', 'tool-result', 'text', 'user'])
    expect(out[0]).toEqual({ kind: 'user', id: 'u1', text: 'leia o arquivo', images: 0 })
    expect(out[4]).toEqual({ kind: 'user', id: 'u3', text: 'veja', images: 1 })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run test/main/normalize.test.ts` → FAIL (import).

- [ ] **Step 4: Implementar `src/main/agent/normalize.ts`**

```ts
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
```

- [ ] **Step 5: Verificar** — `npx vitest run test/main/normalize.test.ts && npm run typecheck` → verde.

- [ ] **Step 6: Commit** — `git add src/main/agent/normalize.ts test/fixtures test/main/normalize.test.ts && git commit -m "feat: normalize SDK stream and session history into agent events"`

---

### Task 3: Reducer do chat (renderer, puro)

**Files:**
- Create: `src/renderer/src/agent/chatReducer.ts`
- Test: `test/renderer/chatReducer.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `StatsEvent`, `PermissionDecision` (Task 1).
- Produces: `type ChatItem`, `type ChatState`, `initialChat: ChatState`, `reduceChat(state: ChatState, event: AgentEvent): ChatState`, `reduceAll(events: AgentEvent[], start?: ChatState): ChatState`, `pendingPermission(state: ChatState): PermissionItem | undefined`.

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/chatReducer.test.ts
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { initialChat, pendingPermission, reduceAll, reduceChat } from '@renderer/agent/chatReducer'

describe('reduceChat', () => {
  it('tracks status, init, mode and model', () => {
    const s = reduceAll([
      { kind: 'status', state: 'running' },
      { kind: 'init', sessionId: 's1', model: 'opus', cwd: '/p', permissionMode: 'default', slashCommands: ['compact'] },
      { kind: 'mode', permissionMode: 'plan' },
      { kind: 'model', model: 'sonnet' },
    ])
    expect(s).toMatchObject({ state: 'running', sessionId: 's1', model: 'sonnet', permissionMode: 'plan', slashCommands: ['compact'] })
  })

  it('accumulates text deltas and lets the final text win', () => {
    const s = reduceAll([
      { kind: 'text-delta', key: 'm:1', text: 'hel' },
      { kind: 'text-delta', key: 'm:1', text: 'lo' },
    ])
    expect(s.items).toEqual([{ type: 'text', key: 'm:1', text: 'hello', final: false }])
    const f = reduceChat(s, { kind: 'text', key: 'm:1', text: 'hello!' })
    expect(f.items).toEqual([{ type: 'text', key: 'm:1', text: 'hello!', final: true }])
    expect(reduceChat(f, { kind: 'text-delta', key: 'm:1', text: 'late' }).items[0]).toMatchObject({ text: 'hello!' })
  })

  it('pushes a final text with no prior deltas and keeps parentToolUseId', () => {
    const s = reduceChat(initialChat, { kind: 'text', key: 'k', text: 'x', parentToolUseId: 'task' })
    expect(s.items).toEqual([{ type: 'text', key: 'k', text: 'x', final: true, parentToolUseId: 'task' }])
  })

  it('attaches tool results to their tool item and ignores unknown ids', () => {
    const s = reduceAll([
      { kind: 'tool-start', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool-result', id: 't1', output: 'a\nb', isError: false },
      { kind: 'tool-result', id: 'nope', output: 'x', isError: true },
    ])
    expect(s.items).toEqual([{ type: 'tool', id: 't1', name: 'Bash', input: { command: 'ls' }, output: 'a\nb', isError: false }])
  })

  it('tracks permission requests and their resolution', () => {
    const s = reduceAll([
      { kind: 'permission-request', requestId: 'r1', toolName: 'Bash', input: { command: 'rm x' }, canAlwaysAllow: true },
    ])
    expect(pendingPermission(s)?.requestId).toBe('r1')
    const r = reduceChat(s, { kind: 'permission-resolved', requestId: 'r1', decision: 'deny' })
    expect(pendingPermission(r)).toBeUndefined()
    expect(r.items[0]).toMatchObject({ type: 'permission', decision: 'deny' })
  })

  it('accumulates cost across turns, keeps last stats, pushes users, thinking and errors', () => {
    const stats = (costUsd: number): AgentEvent => ({
      kind: 'stats',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd,
      durationMs: 10,
    })
    const s = reduceAll([
      { kind: 'user', id: 'u1', text: 'oi', images: 1 },
      { kind: 'thinking', key: 'th', text: 'hmm' },
      { kind: 'thinking', key: 'th', text: 'hmm' },
      stats(0.5),
      stats(0.25),
      { kind: 'error', message: 'boom' },
    ])
    expect(s.totalCostUsd).toBeCloseTo(0.75)
    expect(s.stats?.costUsd).toBe(0.25)
    expect(s.items.map((i) => i.type)).toEqual(['user', 'thinking', 'error'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/chatReducer.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/renderer/src/agent/chatReducer.ts`**

```ts
import type { AgentEvent, PermissionDecision, StatsEvent } from '@shared/agent'
import type { PermissionMode, SessionState } from '@shared/models'

export type TextItem = { type: 'text'; key: string; text: string; final: boolean; parentToolUseId?: string }
export type ToolItem = { type: 'tool'; id: string; name: string; input: unknown; output?: string; isError?: boolean; parentToolUseId?: string }
export type PermissionItem = {
  type: 'permission'
  requestId: string
  toolName: string
  input: unknown
  title?: string
  canAlwaysAllow: boolean
  decision?: PermissionDecision | 'cancelled'
}
export type ChatItem =
  | { type: 'user'; id: string; text: string; images: number }
  | TextItem
  | { type: 'thinking'; key: string; text: string }
  | ToolItem
  | PermissionItem
  | { type: 'error'; id: string; message: string }

export type ChatState = {
  items: ChatItem[]
  state: SessionState
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
  slashCommands: string[]
  stats?: StatsEvent
  totalCostUsd: number
}

export const initialChat: ChatState = { items: [], state: 'idle', slashCommands: [], totalCostUsd: 0 }

const push = (s: ChatState, item: ChatItem): ChatState => ({ ...s, items: [...s.items, item] })
const replaceAt = (s: ChatState, index: number, item: ChatItem): ChatState => {
  const items = [...s.items]
  items[index] = item
  return { ...s, items }
}
const indexOf = (s: ChatState, match: (item: ChatItem) => boolean): number => s.items.findIndex(match)

export function reduceChat(s: ChatState, e: AgentEvent): ChatState {
  switch (e.kind) {
    case 'status':
      return { ...s, state: e.state }
    case 'init':
      return { ...s, sessionId: e.sessionId, model: e.model, permissionMode: e.permissionMode, slashCommands: e.slashCommands }
    case 'mode':
      return { ...s, permissionMode: e.permissionMode }
    case 'model':
      return { ...s, model: e.model }
    case 'user':
      return push(s, { type: 'user', id: e.id, text: e.text, images: e.images })
    case 'text-delta': {
      const i = indexOf(s, (it) => it.type === 'text' && it.key === e.key)
      if (i < 0) {
        return push(s, { type: 'text', key: e.key, text: e.text, final: false, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) })
      }
      const item = s.items[i] as TextItem
      return item.final ? s : replaceAt(s, i, { ...item, text: item.text + e.text })
    }
    case 'text': {
      const item: TextItem = { type: 'text', key: e.key, text: e.text, final: true, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      const i = indexOf(s, (it) => it.type === 'text' && it.key === e.key)
      return i < 0 ? push(s, item) : replaceAt(s, i, item)
    }
    case 'thinking':
      return indexOf(s, (it) => it.type === 'thinking' && it.key === e.key) >= 0 ? s : push(s, { type: 'thinking', key: e.key, text: e.text })
    case 'tool-start': {
      const i = indexOf(s, (it) => it.type === 'tool' && it.id === e.id)
      const base: ToolItem = { type: 'tool', id: e.id, name: e.name, input: e.input, ...(e.parentToolUseId ? { parentToolUseId: e.parentToolUseId } : {}) }
      return i < 0 ? push(s, base) : replaceAt(s, i, { ...(s.items[i] as ToolItem), input: e.input })
    }
    case 'tool-result': {
      const i = indexOf(s, (it) => it.type === 'tool' && it.id === e.id)
      return i < 0 ? s : replaceAt(s, i, { ...(s.items[i] as ToolItem), output: e.output, isError: e.isError })
    }
    case 'permission-request':
      return push(s, {
        type: 'permission',
        requestId: e.requestId,
        toolName: e.toolName,
        input: e.input,
        canAlwaysAllow: e.canAlwaysAllow,
        ...(e.title ? { title: e.title } : {}),
      })
    case 'permission-resolved': {
      const i = indexOf(s, (it) => it.type === 'permission' && it.requestId === e.requestId)
      return i < 0 ? s : replaceAt(s, i, { ...(s.items[i] as PermissionItem), decision: e.decision })
    }
    case 'stats':
      return { ...s, stats: e, totalCostUsd: s.totalCostUsd + e.costUsd }
    case 'error':
      return push(s, { type: 'error', id: `err-${s.items.length}`, message: e.message })
  }
}

export function reduceAll(events: AgentEvent[], start: ChatState = initialChat): ChatState {
  return events.reduce(reduceChat, start)
}

export function pendingPermission(s: ChatState): PermissionItem | undefined {
  return s.items.find((it): it is PermissionItem => it.type === 'permission' && !it.decision)
}
```

- [ ] **Step 4: Verificar** — `npx vitest run test/renderer/chatReducer.test.ts && npm run typecheck` → verde.

- [ ] **Step 5: Commit** — `git add src/renderer/src/agent test/renderer/chatReducer.test.ts && git commit -m "feat: add pure chat reducer for agent events"`

---

### Task 4: AgentSession (main)

**Files:**
- Create: `src/main/agent/AgentSession.ts`
- Test: `test/main/AgentSession.test.ts`

**Interfaces:**
- Consumes: `AsyncQueue` (Task 1), `StreamNormalizer` (Task 2), tipos `@shared/agent`.
- Produces:
  - `type UserMessageLike`, `type PermissionResultLike`, `type CanUseToolLike`, `type QueryOptions`, `type QueryLike`, `type QueryFn` (formas estruturais compatíveis com o SDK; o SDK real é adaptado na Task 5)
  - `type SessionConfig = { cwd: string; model?: string; permissionMode: PermissionMode; resume?: string }`
  - `type SessionDeps = { queryFn: QueryFn; emit(event: AgentEvent): void; claudePath?: string; env?: Record<string, string>; newId?: () => string }`
  - `class AgentSession { constructor(config, deps); readonly currentState: SessionState; readonly isStarted: boolean; start(): void; send(text: string, images?: ImageAttachment[]): void; interrupt(): Promise<void>; setModel(model: string): Promise<void>; setMode(mode: PermissionMode): Promise<void>; commands(): Promise<CommandOption[]>; models(): Promise<ModelOption[]>; respondPermission(requestId: string, decision: PermissionDecision): void; close(): void }`

Comportamento: o processo `claude` só sobe no primeiro `start()`/`send()`/`commands()`/`models()`. Estados: `send` → `running`; `permission-request` → `awaiting_permission`; resposta → volta a `running`; mensagem `result` com zero turnos pendentes e sem permissão pendente → `idle`; exceção no stream → evento `error` + `error`, e o próximo `send` recria a query com `resume` do último `sessionId`; `close()` → cancela permissões, encerra fila e query, `exited`.

- [ ] **Step 1: Testes falhando**

```ts
// test/main/AgentSession.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AsyncQueue } from '../../src/main/agent/AsyncQueue'
import { AgentSession, type QueryFn, type QueryLike, type QueryOptions, type UserMessageLike } from '../../src/main/agent/AgentSession'

const tick = () => new Promise((r) => setTimeout(r, 0))
const INIT = { type: 'system', subtype: 'init', session_id: 'sess-9', model: 'opus', cwd: '/p', permissionMode: 'default', slash_commands: [] }
const RESULT = { type: 'result', subtype: 'success', is_error: false, usage: {}, total_cost_usd: 0.1, duration_ms: 5, modelUsage: {} }

function fake() {
  const out = new AsyncQueue<unknown>()
  const calls: Array<{ options: QueryOptions }> = []
  const received: UserMessageLike[] = []
  const q: QueryLike = {
    [Symbol.asyncIterator]: () => out[Symbol.asyncIterator](),
    interrupt: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    supportedCommands: async () => [{ name: 'compact', description: 'Compacta', argumentHint: '' }],
    supportedModels: async () => [{ value: 'opus', displayName: 'Opus', description: '' }],
    close: vi.fn(() => out.end()),
  }
  const fn: QueryFn = ({ prompt, options }) => {
    calls.push({ options })
    void (async () => {
      for await (const m of prompt) received.push(m)
    })()
    return q
  }
  return { fn, out, q, calls, received }
}

function session(fn: QueryFn, over: Partial<ConstructorParameters<typeof AgentSession>[0]> = {}) {
  const events: AgentEvent[] = []
  let n = 0
  const s = new AgentSession(
    { cwd: '/p', permissionMode: 'default', ...over },
    { queryFn: fn, emit: (e) => events.push(e), newId: () => `id${++n}`, claudePath: '/bin/claude' },
  )
  return { s, events }
}

describe('AgentSession', () => {
  it('starts lazily on first send and reuses the query', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    expect(f.calls).toHaveLength(0)
    s.send('oi')
    s.send('de novo')
    await tick()
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.options).toMatchObject({ cwd: '/p', permissionMode: 'default', includePartialMessages: true, pathToClaudeCodeExecutable: '/bin/claude', settingSources: ['user', 'project', 'local'] })
    expect(f.received.map((m) => m.message.content)).toEqual([[{ type: 'text', text: 'oi' }], [{ type: 'text', text: 'de novo' }]])
    expect(events.slice(0, 2)).toEqual([{ kind: 'user', id: 'id1', text: 'oi', images: 0 }, { kind: 'status', state: 'running' }])
  })

  it('sends images before text as base64 blocks', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('veja', [{ name: 'a.png', mediaType: 'image/png', data: 'AAAA' }])
    await tick()
    expect(f.received[0]!.message.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'veja' },
    ])
  })

  it('emits normalized events and goes idle after the result', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    f.out.push(INIT)
    f.out.push(RESULT)
    await tick()
    expect(events.some((e) => e.kind === 'init')).toBe(true)
    expect(events.at(-1)).toEqual({ kind: 'status', state: 'idle' })
    expect(s.currentState).toBe('idle')
  })

  it('asks for permission, resolves allow-always with suggestions and returns to running', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('apague')
    const decision = f.calls[0]!.options.canUseTool('Bash', { command: 'rm x' }, { signal: new AbortController().signal, suggestions: [{ type: 'addRules' }], title: 'Rodar rm?' })
    expect(events).toContainEqual({ kind: 'permission-request', requestId: 'id2', toolName: 'Bash', input: { command: 'rm x' }, canAlwaysAllow: true, title: 'Rodar rm?' })
    expect(s.currentState).toBe('awaiting_permission')
    s.respondPermission('id2', 'allow-always')
    await expect(decision).resolves.toEqual({ behavior: 'allow', updatedInput: { command: 'rm x' }, updatedPermissions: [{ type: 'addRules' }] })
    expect(events).toContainEqual({ kind: 'permission-resolved', requestId: 'id2', decision: 'allow-always' })
    expect(s.currentState).toBe('running')
  })

  it('denies, and cancels when the SDK aborts the request', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('x')
    const denied = f.calls[0]!.options.canUseTool('Write', {}, { signal: new AbortController().signal })
    s.respondPermission('id2', 'deny')
    await expect(denied).resolves.toMatchObject({ behavior: 'deny' })
    const ac = new AbortController()
    const cancelled = f.calls[0]!.options.canUseTool('Write', {}, { signal: ac.signal })
    ac.abort()
    await expect(cancelled).resolves.toMatchObject({ behavior: 'deny' })
    expect(events).toContainEqual({ kind: 'permission-resolved', requestId: 'id3', decision: 'cancelled' })
  })

  it('applies model and mode before start via options, after start via the query', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    await s.setModel('sonnet')
    await s.setMode('plan')
    s.send('oi')
    expect(f.calls[0]!.options).toMatchObject({ model: 'sonnet', permissionMode: 'plan' })
    await s.setModel('opus')
    expect(f.q.setModel).toHaveBeenCalledWith('opus')
    expect(events).toContainEqual({ kind: 'model', model: 'opus' })
    expect(events).toContainEqual({ kind: 'mode', permissionMode: 'plan' })
  })

  it('lists commands and models, starting the query if needed', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await expect(s.commands()).resolves.toEqual([{ name: 'compact', description: 'Compacta', argumentHint: '' }])
    await expect(s.models()).resolves.toEqual([{ value: 'opus', displayName: 'Opus', description: '' }])
    expect(f.calls).toHaveLength(1)
  })

  it('close cancels pending permissions, closes the query and ignores later sends', async () => {
    const f = fake()
    const { s } = session(f.fn)
    s.send('x')
    const p = f.calls[0]!.options.canUseTool('Bash', {}, { signal: new AbortController().signal })
    s.close()
    await expect(p).resolves.toMatchObject({ behavior: 'deny' })
    expect(f.q.close).toHaveBeenCalled()
    expect(s.currentState).toBe('exited')
    s.send('depois')
    expect(f.calls).toHaveLength(1)
  })

  it('reports stream errors and resumes the last session on the next send', async () => {
    const calls: QueryOptions[] = []
    let first = true
    const fn: QueryFn = ({ options }) => {
      calls.push(options)
      const crash = first
      first = false
      const gen = (async function* () {
        yield INIT
        if (crash) throw new Error('claude exited')
      })()
      return Object.assign(gen, {
        interrupt: async () => undefined,
        setModel: async () => undefined,
        setPermissionMode: async () => undefined,
        supportedCommands: async () => [],
        supportedModels: async () => [],
        close: () => undefined,
      })
    }
    const { s, events } = session(fn)
    s.send('oi')
    await tick()
    await tick()
    expect(events).toContainEqual({ kind: 'error', message: 'claude exited' })
    expect(s.currentState).toBe('error')
    s.send('de novo')
    expect(calls[1]).toMatchObject({ resume: 'sess-9' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/main/AgentSession.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/main/agent/AgentSession.ts`**

```ts
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
```

- [ ] **Step 4: Verificar** — `npx vitest run test/main/AgentSession.test.ts && npm run typecheck` → 9 testes verdes.

- [ ] **Step 5: Commit** — `git add src/main/agent/AgentSession.ts test/main/AgentSession.test.ts && git commit -m "feat: add agent session over streaming SDK query"`

---

### Task 5: AgentManager, SDK real, agente fake, PATH do login e IPC `agent:*`

**Files:**
- Create: `src/main/agent/AgentManager.ts`, `src/main/agent/sdk.ts`, `src/main/agent/fakeQuery.ts`, `src/main/env/loginShell.ts`
- Modify: `src/shared/ipc-contract.ts`, `src/main/ipc/handlers.ts`, `src/main/index.ts`, `test/main/handlers.test.ts`
- Test: `test/main/AgentManager.test.ts`, `test/main/fakeQuery.test.ts`, `test/main/loginShell.test.ts`, `test/main/handlers.test.ts`

**Interfaces:**
- Consumes: `AgentSession`, `QueryFn`, `QueryLike` (Task 4), `historyToEvents` (Task 2), `AsyncQueue` (Task 1), `shellEnv` (Plano 1, `src/main/pty/shellEnv.ts`).
- Produces:
  - `type AgentRuntime = { queryFn: QueryFn; claudePath?: string; env?: Record<string, string> }`
  - `class AgentManager { constructor(deps: { emit(panelId: string, event: AgentEvent): void; runtime(): AgentRuntime }); create(panelId: string, params: AgentPanelParams): void; get(panelId: string): AgentSession; close(panelId: string): void; closeAll(): void; hasBusy(): boolean }`
  - `type SessionStoreApi = { list(dir: string): Promise<SessionSummary[]>; history(dir: string, sessionId: string): Promise<unknown[]> }`
  - `loadSdk(): Promise<{ queryFn: QueryFn } & SessionStoreApi>` (`sdk.ts`)
  - `fakeQuery: QueryFn`, `fakeSessions: SessionStoreApi` (`fakeQuery.ts`)
  - `loginShellPath(shell?: string): Promise<string | null>`, `mergePath(current: string | undefined, login: string | null): string`, `resolveClaudePath(configured: string | undefined, deps?: ClaudePathDeps): Promise<string | undefined>` (`loginShell.ts`)
  - Canais novos (tabela abaixo) e evento `'agent:event': [panelId: string, event: AgentEvent]`.

| Canal | args | result |
|---|---|---|
| `agent:create` | `[panelId, params: AgentPanelParams]` | `void` |
| `agent:start` | `[panelId]` | `void` |
| `agent:send` | `[panelId, text: string, images: ImageAttachment[]]` | `void` |
| `agent:interrupt` | `[panelId]` | `void` |
| `agent:setModel` | `[panelId, model: string]` | `void` |
| `agent:setMode` | `[panelId, mode: PermissionMode]` | `void` |
| `agent:respondPermission` | `[panelId, requestId: string, decision: PermissionDecision]` | `void` |
| `agent:commands` | `[panelId]` | `CommandOption[]` |
| `agent:models` | `[panelId]` | `ModelOption[]` |
| `agent:listSessions` | `[projectPath]` | `SessionSummary[]` |
| `agent:history` | `[projectPath, sessionId]` | `AgentEvent[]` |
| `agent:close` | `[panelId]` | `void` |

- [ ] **Step 1: Testes falhando**

```ts
// test/main/loginShell.test.ts
import { describe, expect, it } from 'vitest'
import { loginShellPath, mergePath, resolveClaudePath } from '../../src/main/env/loginShell'

describe('mergePath', () => {
  it('puts login entries first and dedupes', () => {
    expect(mergePath('/usr/bin:/bin', '/Users/me/.local/bin:/usr/bin')).toBe('/Users/me/.local/bin:/usr/bin:/bin')
    expect(mergePath(undefined, null)).toBe('')
  })
})

describe('resolveClaudePath', () => {
  const deps = (existing: string[], which: string | null) => ({
    exists: (p: string) => existing.includes(p),
    home: '/Users/me',
    which: async () => which,
  })
  it('prefers the configured path, then ~/.local/bin/claude, then the login shell', async () => {
    expect(await resolveClaudePath('/opt/claude', deps(['/opt/claude', '/Users/me/.local/bin/claude'], '/x'))).toBe('/opt/claude')
    expect(await resolveClaudePath('/missing', deps(['/Users/me/.local/bin/claude'], '/x'))).toBe('/Users/me/.local/bin/claude')
    expect(await resolveClaudePath(undefined, deps([], '/usr/local/bin/claude'))).toBe('/usr/local/bin/claude')
    expect(await resolveClaudePath(undefined, deps([], null))).toBeUndefined()
  })
})

describe('loginShellPath', () => {
  it('reads PATH from a login shell', async () => {
    expect(await loginShellPath('/bin/sh')).toMatch(/\/bin/)
  })
  it('returns null when the shell cannot run', async () => {
    expect(await loginShellPath('/nope/shell')).toBeNull()
  })
})
```

```ts
// test/main/AgentManager.test.ts
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AgentManager } from '../../src/main/agent/AgentManager'
import { fakeQuery } from '../../src/main/agent/fakeQuery'

const tick = () => new Promise((r) => setTimeout(r, 5))

function manager() {
  const events: Array<[string, AgentEvent]> = []
  const m = new AgentManager({ emit: (id, e) => events.push([id, e]), runtime: () => ({ queryFn: fakeQuery }) })
  return { m, events }
}

describe('AgentManager', () => {
  it('creates one session per panel and routes events by panel id', async () => {
    const { m, events } = manager()
    m.create('p1', { type: 'agent', projectPath: '/proj' })
    m.create('p1', { type: 'agent', projectPath: '/other' })
    m.get('p1').send('oi')
    await tick()
    expect(events.every(([id]) => id === 'p1')).toBe(true)
    expect(events.some(([, e]) => e.kind === 'text' && e.text === 'Você disse: oi')).toBe(true)
  })

  it('throws for unknown panels, reports busy sessions, closes one and all', () => {
    const { m } = manager()
    expect(() => m.get('x')).toThrow('Sessão de agente não encontrada: x')
    m.create('a', { type: 'agent', projectPath: '/p' })
    m.create('b', { type: 'agent', projectPath: '/p' })
    expect(m.hasBusy()).toBe(false)
    m.get('a').send('oi')
    expect(m.hasBusy()).toBe(true)
    m.close('a')
    expect(() => m.get('a')).toThrow()
    m.closeAll()
    expect(() => m.get('b')).toThrow()
    expect(m.hasBusy()).toBe(false)
  })
})
```

```ts
// test/main/fakeQuery.test.ts
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agent'
import { AgentSession } from '../../src/main/agent/AgentSession'
import { fakeQuery, fakeSessions } from '../../src/main/agent/fakeQuery'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('fakeQuery', () => {
  it('echoes the prompt with streaming, stats and returns to idle', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('olá')
    await tick()
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['init', 'text-delta', 'text', 'stats']))
    expect(s.currentState).toBe('idle')
  })

  it('asks for permission when the prompt mentions "permissão"', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('teste de permissão')
    await tick()
    const req = events.find((e) => e.kind === 'permission-request')
    expect(req).toMatchObject({ toolName: 'Bash', input: { command: 'rm -rf dist' }, canAlwaysAllow: true })
    s.respondPermission(req!.kind === 'permission-request' ? req!.requestId : '', 'allow')
    await tick()
    expect(events).toContainEqual({ kind: 'tool-result', id: 'fake_tool_1', output: 'removido', isError: false })
  })

  it('emits an Edit tool call when the prompt mentions "editar"', async () => {
    const events: AgentEvent[] = []
    const s = new AgentSession({ cwd: '/p', permissionMode: 'default' }, { queryFn: fakeQuery, emit: (e) => events.push(e) })
    s.send('editar arquivo')
    await tick()
    expect(events).toContainEqual({
      kind: 'tool-start',
      id: 'fake_edit_1',
      name: 'Edit',
      input: { file_path: '/tmp/exemplo.ts', old_string: 'const a = 1', new_string: 'const a = 2' },
    })
  })

  it('provides a scripted session list and history', async () => {
    expect((await fakeSessions.list('/p'))[0]).toMatchObject({ sessionId: 'fake-old', title: 'Sessão antiga de teste' })
    expect(await fakeSessions.history('/p', 'fake-old')).toHaveLength(2)
  })
})
```

Acrescentar em `test/main/handlers.test.ts`: no helper `deps()`, os campos novos; e os testes:

```ts
// test/main/handlers.test.ts — imports adicionais
import type { AgentEvent } from '@shared/agent'
import { AgentManager } from '../../src/main/agent/AgentManager'
import { fakeQuery, fakeSessions } from '../../src/main/agent/fakeQuery'

// dentro de deps(), antes de `ptyCalls,`:
//   agents: new AgentManager({ emit: (id, e) => agentEvents.push([id, e]), runtime: () => ({ queryFn: fakeQuery }) }),
//   sessions: fakeSessions,
//   agentReady: async () => undefined,
// e declarar `const agentEvents: Array<[string, AgentEvent]> = []` no topo de deps(), retornando também `agentEvents`.
// Tipo de retorno de deps(): HandlerDeps & { ptyCalls: unknown[][]; agentEvents: Array<[string, AgentEvent]> }

it('agent channels create, send and close sessions', async () => {
  const d = deps()
  const h = buildHandlers(d)
  await h['agent:create']('p1', { type: 'agent', projectPath: '/proj' })
  await h['agent:send']('p1', 'oi', [])
  await new Promise((r) => setTimeout(r, 5))
  expect(d.agentEvents.some(([id, e]) => id === 'p1' && e.kind === 'text')).toBe(true)
  expect((await h['agent:commands']('p1')).map((c) => c.name)).toEqual(['compact', 'review'])
  await h['agent:close']('p1')
  await expect(Promise.resolve().then(() => h['agent:interrupt']('p1'))).rejects.toThrow('Sessão de agente não encontrada')
})

it('agent:history converts stored messages into events', async () => {
  const events = await buildHandlers(deps())['agent:history']('/proj', 'fake-old')
  expect(events.map((e) => e.kind)).toEqual(['user', 'text'])
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/main/loginShell.test.ts test/main/AgentManager.test.ts test/main/fakeQuery.test.ts test/main/handlers.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/main/env/loginShell.ts`**

```ts
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const defaultShell = () => process.env.SHELL || '/bin/zsh'

/** Apps launched from Finder get a minimal PATH; a login shell knows the user's real one. */
export async function loginShellPath(shell: string = defaultShell()): Promise<string | null> {
  try {
    const { stdout } = await exec(shell, ['-lc', 'printf "%s" "$PATH"'], { timeout: 5000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export function mergePath(current: string | undefined, login: string | null): string {
  const parts = [...(login ?? '').split(':'), ...(current ?? '').split(':')].filter(Boolean)
  return [...new Set(parts)].join(':')
}

export type ClaudePathDeps = { exists(path: string): boolean; home: string; which(): Promise<string | null> }

const defaultDeps: ClaudePathDeps = {
  exists: existsSync,
  home: homedir(),
  which: async () => {
    try {
      const { stdout } = await exec(defaultShell(), ['-lc', 'command -v claude'], { timeout: 5000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  },
}

export async function resolveClaudePath(configured: string | undefined, deps: ClaudePathDeps = defaultDeps): Promise<string | undefined> {
  if (configured && deps.exists(configured)) return configured
  const local = join(deps.home, '.local/bin/claude')
  if (deps.exists(local)) return local
  return (await deps.which()) ?? undefined
}
```

- [ ] **Step 4: Implementar `src/main/agent/AgentManager.ts`**

```ts
import type { AgentEvent } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { AgentSession, type QueryFn } from './AgentSession'

export type AgentRuntime = { queryFn: QueryFn; claudePath?: string; env?: Record<string, string> }

export class AgentManager {
  private readonly sessions = new Map<string, AgentSession>()

  constructor(private readonly deps: { emit(panelId: string, event: AgentEvent): void; runtime(): AgentRuntime }) {}

  create(panelId: string, params: AgentPanelParams): void {
    if (this.sessions.has(panelId)) return
    const runtime = this.deps.runtime()
    this.sessions.set(
      panelId,
      new AgentSession(
        {
          cwd: params.projectPath,
          permissionMode: params.permissionMode ?? 'default',
          ...(params.model ? { model: params.model } : {}),
          ...(params.sessionId ? { resume: params.sessionId } : {}),
        },
        {
          queryFn: runtime.queryFn,
          emit: (event) => this.deps.emit(panelId, event),
          ...(runtime.claudePath ? { claudePath: runtime.claudePath } : {}),
          ...(runtime.env ? { env: runtime.env } : {}),
        },
      ),
    )
  }

  get(panelId: string): AgentSession {
    const session = this.sessions.get(panelId)
    if (!session) throw new Error(`Sessão de agente não encontrada: ${panelId}`)
    return session
  }

  close(panelId: string): void {
    this.sessions.get(panelId)?.close()
    this.sessions.delete(panelId)
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }

  hasBusy(): boolean {
    return [...this.sessions.values()].some((s) => s.currentState === 'running' || s.currentState === 'awaiting_permission')
  }
}
```

- [ ] **Step 5: Implementar `src/main/agent/fakeQuery.ts`**

```ts
import { AsyncQueue } from './AsyncQueue'
import type { QueryFn, QueryLike, UserMessageLike } from './AgentSession'
import type { SessionStoreApi } from './sdk'

const textOf = (m: UserMessageLike): string =>
  m.message.content
    .map((b) => (typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
    .join('')

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
      const reply = `Você disse: ${text}`
      const half = Math.ceil(reply.length / 2)
      const textId = `${id}_text`
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: textId } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply.slice(0, half) } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply.slice(half) } } })
      out.push({ type: 'assistant', parent_tool_use_id: null, message: { id: textId, content: [{ type: 'text', text: reply }] } })
      out.push({
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 42,
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        modelUsage: { [model]: { contextWindow: 200000 } },
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
    supportedCommands: async () => [
      { name: 'compact', description: 'Compacta a conversa', argumentHint: '' },
      { name: 'review', description: 'Revisa o código', argumentHint: '[pr]' },
    ],
    supportedModels: async () => [
      { value: 'fake-model', displayName: 'Fake Opus', description: '' },
      { value: 'fake-small', displayName: 'Fake Haiku', description: '' },
    ],
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
```

- [ ] **Step 6: Implementar `src/main/agent/sdk.ts` (único arquivo que importa o SDK)**

```ts
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { SessionSummary } from '@shared/agent'
import type { QueryFn, QueryLike } from './AgentSession'

export type SessionStoreApi = {
  list(dir: string): Promise<SessionSummary[]>
  history(dir: string, sessionId: string): Promise<unknown[]>
}

export async function loadSdk(): Promise<{ queryFn: QueryFn } & SessionStoreApi> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  return {
    // Our option/message shapes are structural subsets of the SDK's; the casts only bridge
    // SDK-specific nominal types (PermissionUpdate, MessageParam) we deliberately don't import elsewhere.
    queryFn: ({ prompt, options }) =>
      sdk.query({ prompt: prompt as AsyncIterable<SDKUserMessage>, options: options as unknown as Options }) as unknown as QueryLike,
    list: async (dir) =>
      (await sdk.listSessions({ dir }))
        .map((s) => ({ sessionId: s.sessionId, title: s.customTitle || s.summary || s.firstPrompt || s.sessionId, lastModified: s.lastModified }))
        .sort((a, b) => b.lastModified - a.lastModified),
    history: (dir, sessionId) => sdk.getSessionMessages(sessionId, { dir }),
  }
}
```

- [ ] **Step 7: Contrato IPC** — em `src/shared/ipc-contract.ts`: importar `AgentPanelParams, PermissionMode` de `./models` e `AgentEvent, CommandOption, ImageAttachment, ModelOption, PermissionDecision, SessionSummary` de `./agent`; adicionar ao `InvokeMap` as 12 linhas da tabela acima (ex.: `'agent:send': { args: [panelId: string, text: string, images: ImageAttachment[]]; result: void }`), os 12 nomes em `INVOKE_CHANNELS`, `'agent:event': [panelId: string, event: AgentEvent]` ao `EventMap` e `'agent:event'` em `EVENT_CHANNELS`.

- [ ] **Step 8: Handlers** — em `src/main/ipc/handlers.ts`:

```ts
// imports adicionais
import type { AgentManager } from '../agent/AgentManager'
import { historyToEvents } from '../agent/normalize'
import type { SessionStoreApi } from '../agent/sdk'

// HandlerDeps ganha:
//   agents: Pick<AgentManager, 'create' | 'get' | 'close'>
//   sessions: SessionStoreApi
//   agentReady: () => Promise<void>

// dentro de buildHandlers, acrescentar:
    'agent:create': (panelId, params) => d.agents.create(panelId, params),
    'agent:start': async (panelId) => {
      await d.agentReady()
      d.agents.get(panelId).start()
    },
    'agent:send': async (panelId, text, images) => {
      await d.agentReady()
      d.agents.get(panelId).send(text, images)
    },
    'agent:interrupt': (panelId) => d.agents.get(panelId).interrupt(),
    'agent:setModel': (panelId, model) => d.agents.get(panelId).setModel(model),
    'agent:setMode': (panelId, mode) => d.agents.get(panelId).setMode(mode),
    'agent:respondPermission': (panelId, requestId, decision) => d.agents.get(panelId).respondPermission(requestId, decision),
    'agent:commands': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).commands()
    },
    'agent:models': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).models()
    },
    'agent:listSessions': async (projectPath) => {
      await d.agentReady()
      return d.sessions.list(projectPath)
    },
    'agent:history': async (projectPath, sessionId) => {
      await d.agentReady()
      return historyToEvents(await d.sessions.history(projectPath, sessionId))
    },
    'agent:close': (panelId) => d.agents.close(panelId),
```

- [ ] **Step 9: Wiring em `src/main/index.ts`**

```ts
// imports adicionais
import { AgentManager } from './agent/AgentManager'
import type { QueryFn } from './agent/AgentSession'
import { fakeQuery, fakeSessions } from './agent/fakeQuery'
import { loadSdk, type SessionStoreApi } from './agent/sdk'
import { loginShellPath, mergePath, resolveClaudePath } from './env/loginShell'
import { shellEnv } from './pty/shellEnv'

// depois de `const ptys = ...`:
type Sdk = { queryFn: QueryFn } & SessionStoreApi
const FAKE_AGENT = process.env.NEXT_IDE_FAKE_AGENT === '1'
let sdk: Sdk | null = null
let claudePath: string | undefined
const agentReady: Promise<void> = (async () => {
  process.env.PATH = mergePath(process.env.PATH, await loginShellPath())
  if (FAKE_AGENT) {
    sdk = { queryFn: fakeQuery, ...fakeSessions }
    return
  }
  claudePath = await resolveClaudePath((await stores.settings.read()).claudePath)
  sdk = await loadSdk()
})()
agentReady.catch((err) => console.error('[next-ide] failed to prepare Claude Agent SDK', err))

const requireSdk = (): Sdk => {
  if (!sdk) throw new Error('O SDK do Claude ainda não carregou.')
  return sdk
}

const agents = new AgentManager({
  emit: (panelId, event) => send('agent:event', panelId, event),
  runtime: () => ({
    queryFn: (params) => requireSdk().queryFn(params),
    env: shellEnv(process.env),
    ...(claudePath ? { claudePath } : {}),
  }),
})

// em buildHandlers({...}) acrescentar:
//   agents,
//   sessions: { list: (dir) => requireSdk().list(dir), history: (dir, id) => requireSdk().history(dir, id) },
//   agentReady: () => agentReady,

// before-quit: substituir o handler inteiro por
app.on('before-quit', (event) => {
  if (quitting) return
  if (mainWindow && !mainWindow.isDestroyed() && agents.hasBusy()) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Sair', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: 'Há agentes trabalhando.',
      detail: 'Sair agora interrompe as sessões em andamento.',
    })
    if (choice === 1) {
      event.preventDefault()
      return
    }
  }
  event.preventDefault()
  quitting = true
  try {
    agents.closeAll()
  } catch (err) {
    console.error('[next-ide] closeAll failed', err)
  }
  try {
    ptys.killAll()
  } catch (err) {
    console.error('[next-ide] killAll failed', err)
  }
  void Promise.allSettled([stores.workspaces.flush(), stores.layout.flush(), stores.settings.flush()]).finally(() => app.quit())
})
```

Se `resolveClaudePath` retornar `undefined` fora do modo fake, `loadSdk` ainda carrega; o erro do SDK ao iniciar vira evento `error` no chat (tratado na Task 6).

- [ ] **Step 10: Verificar**

```bash
npx vitest run test/main && npm run typecheck && npm test && npm run build
grep -c 'import("@anthropic-ai/claude-agent-sdk")' out/main/index.js
npm run test:e2e
```
Expected: todos verdes; o `grep` retorna `1` (o SDK ESM continua como `import()` dinâmico no bundle CJS). Se retornar `0`, conferir se virou `require(` e registrar no relatório (Electron 44/Node 24 suporta `require(esm)`, mas o smoke real da Task 6 confirma).

- [ ] **Step 11: Commit** — `git add -A && git commit -m "feat: wire agent manager, SDK loader and agent IPC channels"` (conferir `git status --short` antes; nada de `.superpowers/`).

---

### Task 6: Painel Agente com chat e composer (primeiro teste visual)

**Files:**
- Create: `src/renderer/src/stores/agentStore.ts`, `src/renderer/src/agent/composerKeys.ts`, `src/renderer/src/panels/agent/AgentPanel.tsx`, `src/renderer/src/panels/agent/ChatView.tsx`, `src/renderer/src/panels/agent/Composer.tsx`, `src/renderer/src/panels/agent/cards/ChatItemView.tsx`, `cards/TextBlock.tsx`, `cards/ThinkingBlock.tsx`, `cards/UserBubble.tsx`, `cards/ErrorCard.tsx`, `cards/GenericToolCard.tsx`, `e2e/agent.spec.ts`, `e2e/agent-real.spec.ts`
- Modify: `src/renderer/src/dock/Dock.tsx`, `src/renderer/src/App.tsx`, `e2e/helpers.ts`
- Delete: `src/renderer/src/panels/agent/AgentStubPanel.tsx`
- Test: `test/renderer/composerKeys.test.ts`, `test/renderer/agentStore.test.ts`, `e2e/agent.spec.ts`

**Interfaces:**
- Consumes: canais `agent:*` e evento `agent:event` (Task 5), `reduceChat`/`reduceAll`/`initialChat`/`ChatItem`/`ChatState` (Task 3), `useDock`, `useSessions`, `registerPanelRemovedListener` (Plano 1).
- Produces:
  - `useAgents` (zustand): `{ chats: Record<string, ChatState>; apply(panelId, event): void; load(panelId, events): void; clear(panelId): void; remove(panelId): void }`, `selectChat(panelId)`, `handleAgentEvent(panelId, event): void`, `subscribeAgentEvents(): void`
  - `composerKeyAction(input: { key: string; shiftKey: boolean; isComposing: boolean; text: string; busy: boolean; hasHistory: boolean }): 'send' | 'interrupt' | 'history' | null`
  - `<AgentPanel>` registrado como componente `agent` do dock; `<ChatView items panelId>`; `<Composer panelId chat onSend>`; `<ChatItemView item items panelId>` (despacho de cartões — Task 7 e 8 acrescentam tipos).

- [ ] **Step 1: Testes unitários falhando**

```ts
// test/renderer/composerKeys.test.ts
import { describe, expect, it } from 'vitest'
import { composerKeyAction } from '@renderer/agent/composerKeys'

const base = { key: 'a', shiftKey: false, isComposing: false, text: 'oi', busy: false, hasHistory: true }

describe('composerKeyAction', () => {
  it('Enter sends, Shift+Enter and IME composition do not', () => {
    expect(composerKeyAction({ ...base, key: 'Enter' })).toBe('send')
    expect(composerKeyAction({ ...base, key: 'Enter', shiftKey: true })).toBeNull()
    expect(composerKeyAction({ ...base, key: 'Enter', isComposing: true })).toBeNull()
  })
  it('Escape interrupts only while busy', () => {
    expect(composerKeyAction({ ...base, key: 'Escape', busy: true })).toBe('interrupt')
    expect(composerKeyAction({ ...base, key: 'Escape' })).toBeNull()
  })
  it('ArrowUp recalls history only with an empty input', () => {
    expect(composerKeyAction({ ...base, key: 'ArrowUp', text: '' })).toBe('history')
    expect(composerKeyAction({ ...base, key: 'ArrowUp' })).toBeNull()
    expect(composerKeyAction({ ...base, key: 'ArrowUp', text: '', hasHistory: false })).toBeNull()
  })
})
```

```ts
// test/renderer/agentStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { handleAgentEvent, selectChat, useAgents } from '@renderer/stores/agentStore'
import { useSessions } from '@renderer/stores/sessionsStore'

describe('agentStore', () => {
  beforeEach(() => {
    useAgents.setState({ chats: {} })
    useSessions.setState({ byId: {}, order: [] })
  })

  it('applies events per panel and mirrors status into the sessions store', () => {
    useSessions.getState().add({ panelId: 'p1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    handleAgentEvent('p1', { kind: 'status', state: 'running' })
    handleAgentEvent('p1', { kind: 'user', id: 'u', text: 'oi', images: 0 })
    expect(selectChat('p1')(useAgents.getState()).state).toBe('running')
    expect(selectChat('p1')(useAgents.getState()).items).toHaveLength(1)
    expect(useSessions.getState().byId.p1!.state).toBe('running')
    expect(selectChat('other')(useAgents.getState()).items).toEqual([])
  })

  it('loads history, clears and removes', () => {
    useAgents.getState().load('p1', [{ kind: 'user', id: 'u', text: 'antiga', images: 0 }])
    expect(useAgents.getState().chats.p1!.items).toHaveLength(1)
    useAgents.getState().clear('p1')
    expect(useAgents.getState().chats.p1!.items).toEqual([])
    useAgents.getState().remove('p1')
    expect(useAgents.getState().chats.p1).toBeUndefined()
  })
})
```

- [ ] **Step 2: E2E falhando** — em `e2e/helpers.ts`, dentro de `launch`, o env passa a incluir `NEXT_IDE_FAKE_AGENT: '1'` junto com o ZDOTDIR hermético (antes de `opts.env`, para que um teste possa sobrescrever com `'0'`). Todos os specs existentes que abrem Claude passam a usar o agente fake.

Também em `e2e/helpers.ts`, exportar o helper usado por todos os specs de agente (Playwright não deve importar um spec de outro):

```ts
// e2e/helpers.ts — acrescentar (mkdtempSync/tmpdir/join já importados; importar basename de node:path)
export async function openAgent(opts: { env?: Record<string, string> } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'proj-agent-'))
  const name = basename(folder)
  const { app, page, userData } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder, ...opts.env } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  return { app, page, name, folder, userData }
}
```

```ts
// e2e/agent.spec.ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('envia mensagem e recebe resposta em streaming', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('olá mundo')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: olá mundo')
  await expect(input).toHaveValue('')
  await app.close()
})

test('Shift+Enter quebra linha sem enviar', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.click()
  await page.keyboard.type('linha 1')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('linha 2')
  await expect(page.getByTestId('user-bubble')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('user-bubble')).toHaveCount(1)
  await expect(page.getByTestId('user-bubble')).toContainText('linha 1')
  await expect(page.getByTestId('user-bubble')).toContainText('linha 2')
  await app.close()
})
```

```ts
// e2e/agent-real.spec.ts — smoke opcional com o Claude real (custa tokens)
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test.skip(process.env.NEXT_IDE_REAL_AGENT !== '1', 'set NEXT_IDE_REAL_AGENT=1 to run against the real Claude')

test('Claude real responde pelo SDK', async () => {
  test.setTimeout(120_000)
  const folder = mkdtempSync(join(tmpdir(), 'proj-real-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder, NEXT_IDE_FAKE_AGENT: '0' } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('Responda apenas com a palavra: pong')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText(/pong/i, { timeout: 90_000 })
  await app.close()
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run test/renderer/composerKeys.test.ts test/renderer/agentStore.test.ts` (FAIL: imports) e `npm run test:e2e -- e2e/agent.spec.ts` (FAIL: textbox não existe).

- [ ] **Step 4: Implementar lógica pura e store**

```ts
// src/renderer/src/agent/composerKeys.ts
export type ComposerKeyInput = { key: string; shiftKey: boolean; isComposing: boolean; text: string; busy: boolean; hasHistory: boolean }

export function composerKeyAction(e: ComposerKeyInput): 'send' | 'interrupt' | 'history' | null {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) return 'send'
  if (e.key === 'Escape' && e.busy) return 'interrupt'
  if (e.key === 'ArrowUp' && e.text === '' && e.hasHistory) return 'history'
  return null
}
```

```ts
// src/renderer/src/stores/agentStore.ts
import { create } from 'zustand'
import type { AgentEvent } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { initialChat, reduceAll, reduceChat, type ChatState } from '../agent/chatReducer'
import { useDock } from '../dock/dockStore'
import { useSessions } from './sessionsStore'

type AgentsState = {
  chats: Record<string, ChatState>
  apply(panelId: string, event: AgentEvent): void
  load(panelId: string, events: AgentEvent[]): void
  clear(panelId: string): void
  remove(panelId: string): void
}

export const useAgents = create<AgentsState>()((set) => ({
  chats: {},
  apply: (panelId, event) => set((s) => ({ chats: { ...s.chats, [panelId]: reduceChat(s.chats[panelId] ?? initialChat, event) } })),
  load: (panelId, events) => set((s) => ({ chats: { ...s.chats, [panelId]: reduceAll(events, s.chats[panelId] ?? initialChat) } })),
  clear: (panelId) => set((s) => ({ chats: { ...s.chats, [panelId]: initialChat } })),
  remove: (panelId) =>
    set((s) => {
      const { [panelId]: _removed, ...rest } = s.chats
      return { chats: rest }
    }),
}))

export const selectChat =
  (panelId: string) =>
  (s: AgentsState): ChatState =>
    s.chats[panelId] ?? initialChat

/** Keeps session id / model / mode in the panel params so the layout restores them. */
function persistParams(panelId: string, patch: Partial<AgentPanelParams>): void {
  const panel = useDock.getState().api?.getPanel(panelId)
  const params = panel?.params as AgentPanelParams | undefined
  if (!panel || params?.type !== 'agent') return
  panel.api.updateParameters({ ...params, ...patch })
}

export function handleAgentEvent(panelId: string, event: AgentEvent): void {
  useAgents.getState().apply(panelId, event)
  if (event.kind === 'status') useSessions.getState().setState(panelId, event.state)
  if (event.kind === 'init' && event.sessionId) persistParams(panelId, { sessionId: event.sessionId })
  if (event.kind === 'model') persistParams(panelId, { model: event.model })
  if (event.kind === 'mode') persistParams(panelId, { permissionMode: event.permissionMode })
}

let subscribed = false
export function subscribeAgentEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('agent:event', handleAgentEvent)
}
```

- [ ] **Step 5: Cartões básicos**

```tsx
// src/renderer/src/panels/agent/cards/TextBlock.tsx
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky-400 underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-lg font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 font-semibold">{children}</h3>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs">{children}</pre>,
  code: ({ children, className }) =>
    className ? <code className={className}>{children}</code> : <code className="rounded bg-neutral-800 px-1 py-0.5 text-[0.85em]">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-neutral-700 px-2 py-1 text-left">{children}</th>,
  td: ({ children }) => <td className="border border-neutral-800 px-2 py-1">{children}</td>,
}

export function TextBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="text-sm text-neutral-200" data-testid="assistant-text">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
      {streaming && <span className="inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-middle" />}
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/ThinkingBlock.tsx
export function ThinkingBlock({ text }: { text: string }) {
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">pensamento</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/UserBubble.tsx
export function UserBubble({ text, images }: { text: string; images: number }) {
  return (
    <div data-testid="user-bubble" className="ml-auto max-w-[85%] rounded-lg bg-neutral-800 px-3 py-2 text-sm whitespace-pre-wrap text-neutral-100">
      {text}
      {images > 0 && <div className="mt-1 text-xs text-neutral-400">📎 {images} imagem(ns)</div>}
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/ErrorCard.tsx
export function ErrorCard({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs whitespace-pre-wrap text-red-300">
      {message}
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/GenericToolCard.tsx
import type { ToolItem } from '../../../agent/chatReducer'

export function toolSummary(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const rec = input as Record<string, unknown>
  const first = rec.file_path ?? rec.path ?? rec.pattern ?? rec.command ?? rec.url ?? rec.description
  return typeof first === 'string' ? first : ''
}

export function ToolStatus({ item }: { item: ToolItem }) {
  if (item.output === undefined) return <span className="text-neutral-500">…</span>
  return item.isError ? <span className="text-red-400">✗</span> : <span className="text-emerald-400">✓</span>
}

export function GenericToolCard({ item }: { item: ToolItem }) {
  return (
    <details className="rounded border border-neutral-800 text-xs" data-testid="tool-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-neutral-300">
        <span className="font-medium">{item.name}</span>
        <span className="truncate text-neutral-500">{toolSummary(item.input)}</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && <pre className="max-h-64 overflow-auto border-t border-neutral-800 p-2 whitespace-pre-wrap text-neutral-400">{item.output}</pre>}
    </details>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/ChatItemView.tsx
import type { ChatItem } from '../../../agent/chatReducer'
import { ErrorCard } from './ErrorCard'
import { GenericToolCard } from './GenericToolCard'
import { TextBlock } from './TextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { UserBubble } from './UserBubble'

export function itemKey(item: ChatItem): string {
  switch (item.type) {
    case 'user':
    case 'error':
    case 'tool':
      return `${item.type}:${item.id}`
    case 'text':
    case 'thinking':
      return `${item.type}:${item.key}`
    case 'permission':
      return `permission:${item.requestId}`
  }
}

export function ChatItemView({ item }: { item: ChatItem; items: ChatItem[]; panelId: string }) {
  switch (item.type) {
    case 'user':
      return <UserBubble text={item.text} images={item.images} />
    case 'text':
      return <TextBlock text={item.text} streaming={!item.final} />
    case 'thinking':
      return <ThinkingBlock text={item.text} />
    case 'tool':
      return <GenericToolCard item={item} />
    case 'error':
      return <ErrorCard message={item.message} />
    case 'permission':
      return <div className="text-xs text-orange-400">Permissão pendente: {item.toolName}</div>
  }
}
```

- [ ] **Step 6: ChatView, Composer e AgentPanel**

```tsx
// src/renderer/src/panels/agent/ChatView.tsx
import { useEffect, useRef } from 'react'
import type { ChatItem } from '../../agent/chatReducer'
import { ChatItemView, itemKey } from './cards/ChatItemView'

const isChild = (item: ChatItem) => (item.type === 'text' || item.type === 'tool') && Boolean(item.parentToolUseId)

export function ChatView({ items, panelId }: { items: ChatItem[]; panelId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [items])

  const topLevel = items.filter((item) => !isChild(item))

  return (
    <div
      ref={ref}
      data-testid="chat-view"
      className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      onScroll={() => {
        const el = ref.current
        if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {topLevel.length === 0 && <div className="pt-10 text-center text-sm text-neutral-600">Pergunte algo ao Claude sobre este projeto.</div>}
      {topLevel.map((item) => (
        <ChatItemView key={itemKey(item)} item={item} items={items} panelId={panelId} />
      ))}
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/Composer.tsx
import { useLayoutEffect, useRef, useState } from 'react'
import type { ImageAttachment } from '@shared/agent'
import type { ChatState } from '../../agent/chatReducer'
import { composerKeyAction } from '../../agent/composerKeys'

type Props = { panelId: string; chat: ChatState; onSend(text: string, images: ImageAttachment[]): void }

export function Composer({ panelId, chat, onSend }: Props) {
  const [text, setText] = useState('')
  const history = useRef<string[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)
  const busy = chat.state === 'running' || chat.state === 'awaiting_permission'

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`
  }, [text])

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSend(value, [])
    history.current.push(value)
    setText('')
  }
  const interrupt = () => void window.api.invoke('agent:interrupt', panelId).catch((err) => console.error('[next-ide] interrupt failed', err))

  return (
    <div className="border-t border-neutral-800 p-2">
      <textarea
        ref={textarea}
        aria-label="Mensagem para o Claude"
        placeholder="Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)"
        rows={1}
        className="w-full resize-none rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const action = composerKeyAction({
            key: e.key,
            shiftKey: e.shiftKey,
            isComposing: e.nativeEvent.isComposing,
            text,
            busy,
            hasHistory: history.current.length > 0,
          })
          if (!action) return
          e.preventDefault()
          if (action === 'send') submit()
          else if (action === 'interrupt') interrupt()
          else setText(history.current.at(-1) ?? '')
        }}
      />
      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500" data-testid="composer-toolbar">
        <span className="flex-1" />
        {busy ? (
          <button aria-label="Parar" className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700" onClick={interrupt}>
            ■
          </button>
        ) : (
          <button aria-label="Enviar" className="rounded bg-orange-600 px-2 py-1 text-white hover:bg-orange-500 disabled:opacity-40" disabled={!text.trim()} onClick={submit}>
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/AgentPanel.tsx
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect } from 'react'
import type { ImageAttachment } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { selectChat, useAgents } from '../../stores/agentStore'
import { ChatView } from './ChatView'
import { Composer } from './Composer'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function AgentPanel({ api, params }: IDockviewPanelProps<AgentPanelParams>) {
  const panelId = api.id
  const chat = useAgents(selectChat(panelId))

  useEffect(() => {
    let cancelled = false
    const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao iniciar o agente: ${errorText(err)}` })
    void (async () => {
      await window.api.invoke('agent:create', panelId, params)
      if (params.sessionId) {
        // Restored panel: show history now, spawn `claude --resume` only on the first send.
        if (useAgents.getState().chats[panelId]) return
        const history = await window.api.invoke('agent:history', params.projectPath, params.sessionId)
        if (!cancelled) useAgents.getState().load(panelId, history)
      } else {
        await window.api.invoke('agent:start', panelId)
      }
    })().catch(fail)
    return () => {
      cancelled = true
    }
    // Params are read once per panel: later changes (sessionId/model/mode) come from this same session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  const send = (text: string, images: ImageAttachment[]) =>
    void window.api
      .invoke('agent:send', panelId, text, images)
      .catch((err) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao enviar: ${errorText(err)}` }))

  return (
    <div className="flex h-full flex-col bg-neutral-950" data-testid="agent-panel">
      <ChatView items={chat.items} panelId={panelId} />
      <Composer panelId={panelId} chat={chat} onSend={send} />
    </div>
  )
}
```

- [ ] **Step 7: Integrar** — em `Dock.tsx`: trocar o import/uso de `AgentStubPanel` por `AgentPanel` no mapa `components`; acrescentar, junto do listener de terminal existente:

```ts
registerPanelRemovedListener((panelId, params) => {
  if (params?.type !== 'agent') return
  useAgents.getState().remove(panelId)
  void window.api.invoke('agent:close', panelId).catch((err) => console.error('[next-ide] agent close failed', err))
})
```

(com `import { useAgents } from '../stores/agentStore'`). Em `App.tsx`, dentro de `App`: `useEffect(() => subscribeAgentEvents(), [])` (import de `useEffect` e de `subscribeAgentEvents`). Apagar `src/renderer/src/panels/agent/AgentStubPanel.tsx`.

- [ ] **Step 8: Verificar**

```bash
npx vitest run test/renderer && npm run typecheck && npm test
npm run test:e2e
NEXT_IDE_REAL_AGENT=1 npx playwright test e2e/agent-real.spec.ts
```
Expected: unitários e E2E verdes (inclui `agent.spec.ts` e os specs antigos, agora com agente fake). O smoke real deve passar usando o login do usuário (se falhar por auth/rede, registrar a mensagem exata no relatório como DONE_WITH_CONCERNS — não enfraquecer o teste).

- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat: add agent chat panel with streaming and native composer"` (conferir `git status --short`).

---

### Task 7: Cartões de ferramentas (Bash, diff de edição, Todo, subagentes)

**Files:**
- Create: `src/renderer/src/agent/toolView.ts`, `src/renderer/src/panels/agent/cards/BashCard.tsx`, `cards/DiffCard.tsx`, `cards/TodoCard.tsx`, `cards/TaskCard.tsx`, `cards/ToolCard.tsx`
- Modify: `src/renderer/src/panels/agent/cards/ChatItemView.tsx` (tool → `ToolCard`)
- Modify: `src/main/agent/fakeQuery.ts` (subagente roteirizado com "subagente")
- Test: `test/renderer/toolView.test.ts`, `e2e/agent-tools.spec.ts`

**Interfaces:**
- Consumes: `ToolItem`, `ChatItem` (Task 3), `GenericToolCard`, `ToolStatus`, `toolSummary`, `ChatItemView`, `itemKey` (Task 6), `diffLines` do pacote `diff` (Task 1).
- Produces:
  - `type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }`
  - `editDiff(oldText: string, newText: string): DiffLine[]`
  - `toolDiff(name: string, input: unknown): { filePath: string; lines: DiffLine[] } | null` (Edit, MultiEdit, Write)
  - `toolTodos(input: unknown): Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }> | null` (TodoWrite)
  - `isQuietTool(name: string): boolean` (Read, Grep, Glob, LS, NotebookRead, WebFetch, WebSearch → linha única recolhida)
  - `<ToolCard item items panelId>` escolhe o cartão certo; `TaskCard` mostra os itens filhos (`parentToolUseId === item.id`) dentro do cartão.

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/toolView.test.ts
import { describe, expect, it } from 'vitest'
import { editDiff, isQuietTool, toolDiff, toolTodos } from '@renderer/agent/toolView'

describe('editDiff', () => {
  it('marks removed and added lines and keeps context', () => {
    expect(editDiff('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      { kind: 'ctx', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'ctx', text: 'c' },
    ])
  })
})

describe('toolDiff', () => {
  it('handles Edit, MultiEdit and Write', () => {
    expect(toolDiff('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' })).toEqual({
      filePath: '/a.ts',
      lines: [
        { kind: 'del', text: 'x' },
        { kind: 'add', text: 'y' },
      ],
    })
    const multi = toolDiff('MultiEdit', { file_path: '/a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] })
    expect(multi?.lines).toEqual([
      { kind: 'del', text: 'a' },
      { kind: 'add', text: 'b' },
      { kind: 'ctx', text: '⋯' },
      { kind: 'del', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(toolDiff('Write', { file_path: '/n.ts', content: 'l1\nl2' })?.lines).toEqual([
      { kind: 'add', text: 'l1' },
      { kind: 'add', text: 'l2' },
    ])
  })
  it('returns null for other tools or malformed input', () => {
    expect(toolDiff('Bash', { command: 'ls' })).toBeNull()
    expect(toolDiff('Edit', { file_path: '/a.ts' })).toBeNull()
  })
})

describe('toolTodos', () => {
  it('reads TodoWrite todos and rejects malformed input', () => {
    expect(toolTodos({ todos: [{ content: 'fazer', status: 'in_progress', activeForm: 'fazendo' }] })).toEqual([{ content: 'fazer', status: 'in_progress' }])
    expect(toolTodos({ todos: 'x' })).toBeNull()
  })
})

describe('isQuietTool', () => {
  it('collapses read-only tools', () => {
    expect(isQuietTool('Read')).toBe(true)
    expect(isQuietTool('Grep')).toBe(true)
    expect(isQuietTool('Bash')).toBe(false)
  })
})
```

```ts
// e2e/agent-tools.spec.ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('mostra diff de edição e subagente agrupado', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('editar arquivo')
  await input.press('Enter')
  const diff = page.getByTestId('diff-card')
  await expect(diff).toContainText('/tmp/exemplo.ts')
  await expect(diff.locator('[data-kind="del"]')).toContainText('const a = 1')
  await expect(diff.locator('[data-kind="add"]')).toContainText('const a = 2')

  await input.fill('rodar subagente')
  await input.press('Enter')
  const task = page.getByTestId('task-card')
  await expect(task).toContainText('Explorar o projeto')
  await task.locator('summary').click()
  await expect(task).toContainText('Resposta do subagente')
  await app.close()
})
```

(`openAgent` já existe em `e2e/helpers.ts` desde a Task 6 — o import correto é `import { openAgent } from './helpers'`.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/toolView.test.ts` → FAIL (import).

- [ ] **Step 3: Implementar `src/renderer/src/agent/toolView.ts`**

```ts
import { diffLines } from 'diff'

export type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }
export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null
const splitLines = (value: string): string[] => {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function editDiff(oldText: string, newText: string): DiffLine[] {
  return diffLines(oldText, newText).flatMap((part) =>
    splitLines(part.value).map((text): DiffLine => ({ kind: part.added ? 'add' : part.removed ? 'del' : 'ctx', text })),
  )
}

export function toolDiff(name: string, input: unknown): { filePath: string; lines: DiffLine[] } | null {
  if (!isRec(input) || typeof input.file_path !== 'string') return null
  const filePath = input.file_path
  if (name === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return { filePath, lines: editDiff(input.old_string, input.new_string) }
  }
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    const chunks = input.edits
      .filter((e): e is Rec => isRec(e) && typeof e.old_string === 'string' && typeof e.new_string === 'string')
      .map((e) => editDiff(e.old_string as string, e.new_string as string))
    return { filePath, lines: chunks.flatMap((chunk, i) => (i === 0 ? chunk : [{ kind: 'ctx' as const, text: '⋯' }, ...chunk])) }
  }
  if (name === 'Write' && typeof input.content === 'string') {
    return { filePath, lines: splitLines(input.content).map((text) => ({ kind: 'add' as const, text })) }
  }
  return null
}

export function toolTodos(input: unknown): Todo[] | null {
  if (!isRec(input) || !Array.isArray(input.todos)) return null
  return input.todos
    .filter((t): t is Rec => isRec(t) && typeof t.content === 'string')
    .map((t) => ({
      content: t.content as string,
      status: t.status === 'completed' || t.status === 'in_progress' ? t.status : 'pending',
    }))
}

const QUIET = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch'])
export const isQuietTool = (name: string): boolean => QUIET.has(name)
```

- [ ] **Step 4: Cartões**

```tsx
// src/renderer/src/panels/agent/cards/BashCard.tsx
import type { ToolItem } from '../../../agent/chatReducer'
import { ToolStatus } from './GenericToolCard'

export function BashCard({ item }: { item: ToolItem }) {
  const command = typeof (item.input as { command?: unknown })?.command === 'string' ? (item.input as { command: string }).command : ''
  return (
    <details open className="rounded border border-neutral-800 text-xs" data-testid="bash-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-neutral-300">Bash</span>
        <code className="truncate text-neutral-400">{command}</code>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && (
        <pre className={`max-h-72 overflow-auto border-t border-neutral-800 bg-black/40 p-2 font-mono whitespace-pre-wrap ${item.isError ? 'text-red-300' : 'text-neutral-300'}`}>
          {item.output || '(sem saída)'}
        </pre>
      )}
    </details>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/DiffCard.tsx
import type { DiffLine } from '../../../agent/toolView'
import type { ToolItem } from '../../../agent/chatReducer'
import { ToolStatus } from './GenericToolCard'

const STYLE: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-950/60 text-emerald-300',
  del: 'bg-red-950/60 text-red-300',
  ctx: 'text-neutral-500',
}
const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ' }

export function DiffCard({ item, filePath, lines }: { item: ToolItem; filePath: string; lines: DiffLine[] }) {
  return (
    <details open className="rounded border border-neutral-800 text-xs" data-testid="diff-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-neutral-300">{item.name}</span>
        <span className="truncate text-neutral-400">{filePath}</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      <div className="max-h-96 overflow-auto border-t border-neutral-800 font-mono">
        {lines.map((line, i) => (
          <div key={i} data-kind={line.kind} className={`px-2 whitespace-pre ${STYLE[line.kind]}`}>
            {SIGN[line.kind]} {line.text}
          </div>
        ))}
      </div>
      {item.isError && item.output && <div className="border-t border-neutral-800 p-2 text-red-300">{item.output}</div>}
    </details>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/TodoCard.tsx
import type { Todo } from '../../../agent/toolView'

const ICON: Record<Todo['status'], string> = { pending: '☐', in_progress: '◐', completed: '☑' }

export function TodoCard({ todos }: { todos: Todo[] }) {
  return (
    <div className="rounded border border-neutral-800 px-3 py-2 text-xs" data-testid="todo-card">
      <div className="mb-1 font-medium text-neutral-300">Tarefas</div>
      <ul className="space-y-0.5">
        {todos.map((t, i) => (
          <li key={i} className={t.status === 'completed' ? 'text-neutral-500 line-through' : t.status === 'in_progress' ? 'text-sky-300' : 'text-neutral-300'}>
            {ICON[t.status]} {t.content}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/TaskCard.tsx
import type { ChatItem, ToolItem } from '../../../agent/chatReducer'
import { ChatItemView, itemKey } from './ChatItemView'
import { ToolStatus } from './GenericToolCard'

export function TaskCard({ item, items, panelId }: { item: ToolItem; items: ChatItem[]; panelId: string }) {
  const children = items.filter((c) => (c.type === 'text' || c.type === 'tool') && c.parentToolUseId === item.id)
  const description = typeof (item.input as { description?: unknown })?.description === 'string' ? (item.input as { description: string }).description : 'Subagente'
  return (
    <details className="rounded border border-violet-900/60 text-xs" data-testid="task-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-violet-300">Subagente</span>
        <span className="truncate text-neutral-400">{description}</span>
        <span className="text-neutral-600">({children.length})</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      <div className="space-y-2 border-t border-violet-900/40 p-2">
        {children.map((child) => (
          <ChatItemView key={itemKey(child)} item={child} items={items} panelId={panelId} />
        ))}
      </div>
    </details>
  )
}
```

```tsx
// src/renderer/src/panels/agent/cards/ToolCard.tsx
import type { ChatItem, ToolItem } from '../../../agent/chatReducer'
import { isQuietTool, toolDiff, toolTodos } from '../../../agent/toolView'
import { BashCard } from './BashCard'
import { DiffCard } from './DiffCard'
import { GenericToolCard } from './GenericToolCard'
import { TaskCard } from './TaskCard'
import { TodoCard } from './TodoCard'

export function ToolCard({ item, items, panelId }: { item: ToolItem; items: ChatItem[]; panelId: string }) {
  if (item.name === 'Task' || item.name === 'Agent') return <TaskCard item={item} items={items} panelId={panelId} />
  if (item.name === 'Bash') return <BashCard item={item} />
  const diff = toolDiff(item.name, item.input)
  if (diff) return <DiffCard item={item} filePath={diff.filePath} lines={diff.lines} />
  const todos = item.name === 'TodoWrite' ? toolTodos(item.input) : null
  if (todos) return <TodoCard todos={todos} />
  if (isQuietTool(item.name)) return <GenericToolCard item={item} />
  return <GenericToolCard item={item} />
}
```

Em `ChatItemView.tsx`, trocar o ramo `tool` para `return <ToolCard item={item} items={items} panelId={panelId} />` (import de `./ToolCard`), recebendo `items` e `panelId` das props.

- [ ] **Step 5: Subagente no fake** — em `src/main/agent/fakeQuery.ts`, dentro do loop, antes da resposta final, acrescentar:

```ts
      if (text.includes('subagente')) {
        const taskId = `fake_task_${turn}`
        out.push({ type: 'assistant', parent_tool_use_id: null, message: { id, content: [{ type: 'tool_use', id: taskId, name: 'Task', input: { description: 'Explorar o projeto', prompt: 'explore' } }] } })
        out.push({ type: 'assistant', parent_tool_use_id: taskId, message: { id: `${id}_sub`, content: [{ type: 'text', text: 'Resposta do subagente' }] } })
        out.push({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: taskId, content: 'feito' }] } })
      }
```

- [ ] **Step 6: Verificar** — `npx vitest run test/renderer/toolView.test.ts && npm run typecheck && npm test && npm run test:e2e` → verde (inclui `agent-tools.spec.ts`).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: add tool cards for bash, edit diffs, todos and subagents"`

---

### Task 8: Permissões inline, modo de permissão e seletor de modelo

**Files:**
- Create: `src/renderer/src/agent/permissions.ts`, `src/renderer/src/panels/agent/cards/PermissionCard.tsx`, `src/renderer/src/panels/agent/ModelSelect.tsx`, `src/renderer/src/panels/agent/ModeSelect.tsx`
- Modify: `src/renderer/src/panels/agent/cards/ChatItemView.tsx` (permission → `PermissionCard`), `src/renderer/src/panels/agent/Composer.tsx` (toolbar)
- Test: `test/renderer/permissions.test.ts`, `e2e/agent-permissions.spec.ts`

**Interfaces:**
- Consumes: `PermissionItem`, `ChatState` (Task 3), canais `agent:respondPermission`, `agent:setMode`, `agent:setModel`, `agent:models` (Task 5), `ModelOption` (Task 1).
- Produces: `MODE_OPTIONS: Array<{ value: PermissionMode; label: string }>`, `permissionSummary(toolName: string, input: unknown): string`, `decisionLabel(decision: PermissionDecision | 'cancelled'): string`; componentes `<PermissionCard item panelId>`, `<ModeSelect panelId mode>`, `<ModelSelect panelId model>`.

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/permissions.test.ts
import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, decisionLabel, permissionSummary } from '@renderer/agent/permissions'

describe('permissions view helpers', () => {
  it('summarizes the most relevant input field', () => {
    expect(permissionSummary('Bash', { command: 'rm -rf dist' })).toBe('rm -rf dist')
    expect(permissionSummary('Write', { file_path: '/a.ts', content: 'x' })).toBe('/a.ts')
    expect(permissionSummary('WebFetch', { url: 'https://x.dev' })).toBe('https://x.dev')
    expect(permissionSummary('mcp__db__query', { sql: 'select 1' })).toBe('{"sql":"select 1"}')
  })

  it('labels decisions and lists modes in pt-BR', () => {
    expect(decisionLabel('allow')).toBe('Permitido')
    expect(decisionLabel('allow-always')).toBe('Sempre permitido')
    expect(decisionLabel('deny')).toBe('Negado')
    expect(decisionLabel('cancelled')).toBe('Cancelado')
    expect(MODE_OPTIONS.map((m) => m.value)).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'])
  })
})
```

```ts
// e2e/agent-permissions.spec.ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('aprova permissão inline e troca modo e modelo', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('teste de permissão')
  await input.press('Enter')

  const card = page.getByTestId('permission-card')
  await expect(card).toContainText('Bash')
  await expect(card).toContainText('rm -rf dist')
  await expect(page.getByTestId('active-sessions')).toBeVisible()
  await card.getByRole('button', { name: 'Permitir', exact: true }).click()
  await expect(card).toContainText('Permitido')
  await expect(page.getByTestId('bash-card')).toContainText('removido')

  await page.getByRole('combobox', { name: 'Modo de permissão' }).selectOption('plan')
  await expect(page.getByRole('combobox', { name: 'Modo de permissão' })).toHaveValue('plan')

  const model = page.getByRole('combobox', { name: 'Modelo' })
  await model.click()
  await expect(model.locator('option', { hasText: 'Fake Haiku' })).toHaveCount(1)
  await model.selectOption('fake-small')
  await expect(model).toHaveValue('fake-small')
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/permissions.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/renderer/src/agent/permissions.ts
import type { PermissionDecision } from '@shared/agent'
import type { PermissionMode } from '@shared/models'

export const MODE_OPTIONS: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Perguntar' },
  { value: 'acceptEdits', label: 'Aceitar edições' },
  { value: 'plan', label: 'Plano' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Sem permissões' },
]

export function permissionSummary(_toolName: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const rec = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern']) {
    if (typeof rec[key] === 'string') return rec[key] as string
  }
  return JSON.stringify(input)
}

const LABELS: Record<PermissionDecision | 'cancelled', string> = {
  allow: 'Permitido',
  'allow-always': 'Sempre permitido',
  deny: 'Negado',
  cancelled: 'Cancelado',
}
export const decisionLabel = (decision: PermissionDecision | 'cancelled'): string => LABELS[decision]
```

```tsx
// src/renderer/src/panels/agent/cards/PermissionCard.tsx
import type { PermissionDecision } from '@shared/agent'
import type { PermissionItem } from '../../../agent/chatReducer'
import { decisionLabel, permissionSummary } from '../../../agent/permissions'

export function PermissionCard({ item, panelId }: { item: PermissionItem; panelId: string }) {
  const respond = (decision: PermissionDecision) =>
    void window.api.invoke('agent:respondPermission', panelId, item.requestId, decision).catch((err) => console.error('[next-ide] permission reply failed', err))
  return (
    <div data-testid="permission-card" className={`rounded border px-3 py-2 text-xs ${item.decision ? 'border-neutral-800 text-neutral-500' : 'border-orange-700 bg-orange-950/30 text-neutral-200'}`}>
      <div className="font-medium">
        {item.decision ? '' : '⚠ '}
        {item.title ?? `Permitir ${item.toolName}?`}
      </div>
      <code className="mt-1 block truncate text-neutral-400">
        {item.toolName}: {permissionSummary(item.toolName, item.input)}
      </code>
      {item.decision ? (
        <div className="mt-1">{decisionLabel(item.decision)}</div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600" onClick={() => respond('allow')}>
            Permitir
          </button>
          {item.canAlwaysAllow && (
            <button className="rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600" onClick={() => respond('allow-always')}>
              Sempre neste projeto
            </button>
          )}
          <button className="rounded bg-red-800 px-2 py-1 text-white hover:bg-red-700" onClick={() => respond('deny')}>
            Negar
          </button>
        </div>
      )}
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/ModeSelect.tsx
import type { PermissionMode } from '@shared/models'
import { MODE_OPTIONS } from '../../agent/permissions'

export function ModeSelect({ panelId, mode }: { panelId: string; mode: PermissionMode | undefined }) {
  return (
    <select
      aria-label="Modo de permissão"
      className="rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={mode ?? 'default'}
      onChange={(e) =>
        void window.api.invoke('agent:setMode', panelId, e.target.value as PermissionMode).catch((err) => console.error('[next-ide] setMode failed', err))
      }
    >
      {MODE_OPTIONS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
```

```tsx
// src/renderer/src/panels/agent/ModelSelect.tsx
import { useState } from 'react'
import type { ModelOption } from '@shared/agent'

export function ModelSelect({ panelId, model }: { panelId: string; model: string | undefined }) {
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  const load = () => {
    if (options) return
    void window.api
      .invoke('agent:models', panelId)
      .then(setOptions)
      .catch((err) => console.error('[next-ide] models failed', err))
  }
  const list = options ?? []
  const current = model ?? ''
  return (
    <select
      aria-label="Modelo"
      className="max-w-40 rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={current}
      onMouseDown={load}
      onFocus={load}
      onChange={(e) => void window.api.invoke('agent:setModel', panelId, e.target.value).catch((err) => console.error('[next-ide] setModel failed', err))}
    >
      {!list.some((o) => o.value === current) && <option value={current}>{current || 'modelo padrão'}</option>}
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.displayName}
        </option>
      ))}
    </select>
  )
}
```

Em `Composer.tsx`, no `composer-toolbar`, antes do `<span className="flex-1" />`: `<ModelSelect panelId={panelId} model={chat.model} />` e `<ModeSelect panelId={panelId} mode={chat.permissionMode} />`. Em `ChatItemView.tsx`, ramo `permission`: `return <PermissionCard item={item} panelId={panelId} />`.

- [ ] **Step 4: Verificar** — `npx vitest run test/renderer/permissions.test.ts && npm run typecheck && npm test && npm run test:e2e` → verde.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add inline permission cards and model/mode selectors"`

---

### Task 9: Comandos `/`, `/resume`, `/clear` e comandos só da TUI

**Files:**
- Create: `src/renderer/src/agent/slash.ts`, `src/renderer/src/panels/agent/SlashMenu.tsx`, `src/renderer/src/panels/agent/ResumeModal.tsx`
- Modify: `src/shared/models.ts` (`TerminalPanelParams.initialCommand?`), `src/renderer/src/panels/terminal/terminalRegistry.ts` + `TerminalPanel.tsx` (roda `initialCommand`), `src/renderer/src/stores/agentStore.ts` (`replacePanelParams`, `currentAgentParams`), `src/renderer/src/panels/agent/Composer.tsx`, `src/renderer/src/panels/agent/AgentPanel.tsx`, `src/renderer/src/panels/agent/ModelSelect.tsx` (id para foco)
- Test: `test/renderer/slash.test.ts`, `e2e/agent-slash.spec.ts`

**Interfaces:**
- Consumes: `CommandOption` (Task 1), canais `agent:commands`, `agent:listSessions`, `agent:history`, `agent:close`, `agent:create`, `agent:start` (Task 5), `useAgents` (Task 6), `useDock.open` (Plano 1).
- Produces:
  - `type SlashItem = { name: string; description: string; argumentHint: string; local: boolean }`, `LOCAL_COMMANDS: SlashItem[]`, `slashQuery(text: string): string | null`, `mergeCommands(sdk: CommandOption[], initNames: string[]): SlashItem[]`, `filterCommands(items: SlashItem[], query: string): SlashItem[]`, `type SlashAction`, `classifySlash(text: string): SlashAction`
  - `replacePanelParams(panelId: string, params: AgentPanelParams): void`, `currentAgentParams(panelId: string): AgentPanelParams | undefined`
  - `<SlashMenu items activeIndex onPick>`, `<ResumeModal projectPath onPick onClose>`
  - Composer ganha props `onLocalCommand(name: 'resume' | 'clear' | 'model' | 'statusline'): void` e `projectPath: string`.

Regras: `/resume`, `/clear`, `/model`, `/statusline` são locais (UI). `/login`, `/logout`, `/mcp`, `/config`, `/usage`, `/doctor`, `/permissions`, `/hooks`, `/agents`, `/ide`, `/vim`, `/terminal-setup`, `/upgrade`, `/status`, `/bug` são só da TUI → aviso no composer com botão "Abrir em terminal" que abre um painel zsh no projeto rodando `claude /<cmd>`. Qualquer outro `/x` é enviado ao agente como texto (skills, comandos custom, `/compact`).

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/slash.test.ts
import { describe, expect, it } from 'vitest'
import { LOCAL_COMMANDS, classifySlash, filterCommands, mergeCommands, slashQuery } from '@renderer/agent/slash'

describe('slashQuery', () => {
  it('returns the partial command while typing a single slash word', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/com')).toBe('com')
    expect(slashQuery('/compact agora')).toBeNull()
    expect(slashQuery('oi /x')).toBeNull()
  })
})

describe('mergeCommands / filterCommands', () => {
  const merged = mergeCommands([{ name: 'compact', description: 'Compacta', argumentHint: '' }, { name: 'clear', description: 'dup', argumentHint: '' }], ['review', 'compact'])
  it('puts local commands first, dedupes, and appends init-only names', () => {
    expect(merged.slice(0, LOCAL_COMMANDS.length).every((c) => c.local)).toBe(true)
    expect(merged.filter((c) => c.name === 'clear')).toHaveLength(1)
    expect(merged.map((c) => c.name)).toEqual(['resume', 'clear', 'model', 'statusline', 'compact', 'review'])
  })
  it('ranks prefix matches first and caps at 8', () => {
    expect(filterCommands(merged, 're').map((c) => c.name)).toEqual(['resume', 'review'])
    expect(filterCommands(merged, '').length).toBeLessThanOrEqual(8)
  })
})

describe('classifySlash', () => {
  it('routes local, tui-only and pass-through commands', () => {
    expect(classifySlash('/resume')).toEqual({ kind: 'local', name: 'resume' })
    expect(classifySlash('  /clear  ')).toEqual({ kind: 'local', name: 'clear' })
    expect(classifySlash('/login')).toEqual({ kind: 'tui', name: 'login' })
    expect(classifySlash('/compact foco em testes')).toEqual({ kind: 'send' })
    expect(classifySlash('oi')).toEqual({ kind: 'send' })
  })
})
```

```ts
// e2e/agent-slash.spec.ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('autocomplete de /, /resume, /clear e aviso de comando da TUI', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/')
  const menu = page.getByRole('listbox', { name: 'Comandos' })
  await expect(menu).toContainText('resume')
  await expect(menu).toContainText('compact')
  await input.fill('/comp')
  await input.press('Tab')
  await expect(input).toHaveValue('/compact ')

  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('pergunta antiga')
  await expect(page.getByTestId('chat-view')).toContainText('resposta antiga')

  await input.fill('/clear')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).not.toContainText('pergunta antiga')

  await input.fill('/login')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('/login')
  await page.getByRole('button', { name: 'Abrir em terminal' }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/slash.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/renderer/src/agent/slash.ts`**

```ts
import type { CommandOption } from '@shared/agent'

export type SlashItem = { name: string; description: string; argumentHint: string; local: boolean }
export type LocalCommand = 'resume' | 'clear' | 'model' | 'statusline'
export type SlashAction = { kind: 'local'; name: LocalCommand } | { kind: 'tui'; name: string } | { kind: 'send' }

export const LOCAL_COMMANDS: SlashItem[] = [
  { name: 'resume', description: 'Retomar uma sessão anterior deste projeto', argumentHint: '', local: true },
  { name: 'clear', description: 'Começar uma conversa nova neste painel', argumentHint: '', local: true },
  { name: 'model', description: 'Trocar o modelo', argumentHint: '', local: true },
  { name: 'statusline', description: 'Configurar a barra de status', argumentHint: '', local: true },
]

const LOCAL_NAMES = new Set<string>(LOCAL_COMMANDS.map((c) => c.name))
const TUI_ONLY = new Set([
  'login', 'logout', 'mcp', 'config', 'usage', 'doctor', 'permissions', 'hooks',
  'agents', 'ide', 'vim', 'terminal-setup', 'upgrade', 'status', 'bug',
])

export function slashQuery(text: string): string | null {
  const match = /^\/(\S*)$/.exec(text)
  return match ? match[1]! : null
}

export function mergeCommands(sdk: CommandOption[], initNames: string[]): SlashItem[] {
  const seen = new Set(LOCAL_NAMES)
  const out: SlashItem[] = [...LOCAL_COMMANDS]
  for (const c of sdk) {
    if (seen.has(c.name)) continue
    seen.add(c.name)
    out.push({ ...c, local: false })
  }
  for (const name of initNames) {
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ name, description: '', argumentHint: '', local: false })
  }
  return out
}

export function filterCommands(items: SlashItem[], query: string): SlashItem[] {
  const q = query.toLowerCase()
  const prefix = items.filter((c) => c.name.toLowerCase().startsWith(q))
  const rest = items.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q))
  return [...prefix, ...rest].slice(0, 8)
}

export function classifySlash(text: string): SlashAction {
  const match = /^\/(\S+)$/.exec(text.trim())
  if (!match) return { kind: 'send' }
  const name = match[1]!
  if (LOCAL_NAMES.has(name)) return { kind: 'local', name: name as LocalCommand }
  if (TUI_ONLY.has(name)) return { kind: 'tui', name }
  return { kind: 'send' }
}
```

- [ ] **Step 4: Terminal com comando inicial** — em `src/shared/models.ts`: `export type TerminalPanelParams = { type: 'terminal'; projectPath: string; initialCommand?: string }`. Em `terminalRegistry.ts`, `attachTerminal(panelId, cwd, container, initialCommand?: string)`: trocar a chamada de `pty:create` por

```ts
  void window.api
    .invoke('pty:create', panelId, cwd, cols, rows)
    .then(() => {
      if (initialCommand) return window.api.invoke('pty:write', panelId, `${initialCommand}\r`)
    })
    .catch((err) => {
      // keep the existing red "[falha ao iniciar o terminal: …]" handling here unchanged
    })
```

(mantendo o corpo do `.catch` que já existe). Em `TerminalPanel.tsx`, passar `params.initialCommand` como 4º argumento de `attachTerminal`.

- [ ] **Step 5: Store helpers** — em `agentStore.ts`, exportar:

```ts
export function currentAgentParams(panelId: string): AgentPanelParams | undefined {
  const params = useDock.getState().api?.getPanel(panelId)?.params as AgentPanelParams | undefined
  return params?.type === 'agent' ? params : undefined
}

export function replacePanelParams(panelId: string, params: AgentPanelParams): void {
  useDock.getState().api?.getPanel(panelId)?.api.updateParameters(params)
}
```

- [ ] **Step 6: SlashMenu e ResumeModal**

```tsx
// src/renderer/src/panels/agent/SlashMenu.tsx
import type { SlashItem } from '../../agent/slash'

export function SlashMenu({ items, activeIndex, onPick }: { items: SlashItem[]; activeIndex: number; onPick(item: SlashItem): void }) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label="Comandos" className="mb-1 max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 py-1 text-xs">
      {items.map((item, i) => (
        <li
          key={item.name}
          role="option"
          aria-selected={i === activeIndex}
          className={`flex cursor-pointer gap-2 px-3 py-1 ${i === activeIndex ? 'bg-neutral-800' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
        >
          <span className="text-neutral-100">/{item.name}</span>
          {item.argumentHint && <span className="text-neutral-500">{item.argumentHint}</span>}
          <span className="truncate text-neutral-500">{item.description}</span>
          {item.local && <span className="ml-auto text-neutral-600">ide</span>}
        </li>
      ))}
    </ul>
  )
}
```

```tsx
// src/renderer/src/panels/agent/ResumeModal.tsx
import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/agent'

const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function ResumeModal({ projectPath, onPick, onClose }: { projectPath: string; onPick(sessionId: string): void; onClose(): void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .invoke('agent:listSessions', projectPath)
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectPath])
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Retomar sessão" className="w-[min(520px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Retomar sessão</div>
        {error && <div className="text-red-400">{error}</div>}
        {!sessions && !error && <div className="text-neutral-500">Carregando…</div>}
        {sessions?.length === 0 && <div className="text-neutral-500">Nenhuma sessão anterior neste projeto.</div>}
        <div className="max-h-80 space-y-1 overflow-auto">
          {sessions?.map((s) => (
            <button key={s.sessionId} className="block w-full rounded px-2 py-1 text-left hover:bg-neutral-800" onClick={() => onPick(s.sessionId)}>
              <div className="truncate text-neutral-100">{s.title}</div>
              <div className="text-xs text-neutral-500">{when(s.lastModified)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Composer com menu, comandos locais e aviso** — alterações em `Composer.tsx`:

```tsx
// novas props: projectPath: string; onLocalCommand(name: LocalCommand): void
// novo estado:
const [commands, setCommands] = useState<SlashItem[] | null>(null)
const [menuIndex, setMenuIndex] = useState(0)
const [notice, setNotice] = useState<{ text: string; command: string } | null>(null)
const query = slashQuery(text)
const menuItems = query === null ? [] : filterCommands(commands ?? mergeCommands([], chat.slashCommands), query)

useEffect(() => {
  if (query === null || commands) return
  window.api
    .invoke('agent:commands', panelId)
    .then((sdk) => setCommands(mergeCommands(sdk, chat.slashCommands)))
    .catch(() => setCommands(mergeCommands([], chat.slashCommands)))
}, [query === null, commands, panelId, chat.slashCommands])

const pick = (item: SlashItem) => {
  setText(`/${item.name} `)
  setMenuIndex(0)
}

// submit passa a classificar antes de enviar:
const submit = () => {
  const value = text.trim()
  if (!value) return
  const action = classifySlash(value)
  setNotice(null)
  if (action.kind === 'local') {
    setText('')
    onLocalCommand(action.name)
    return
  }
  if (action.kind === 'tui') {
    setNotice({ text: `/${action.name} só funciona no terminal do Claude Code.`, command: `claude /${action.name}` })
    return
  }
  onSend(value, [])
  history.current.push(value)
  setText('')
}

// no onKeyDown, ANTES de composerKeyAction:
if (menuItems.length > 0) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    setMenuIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : menuItems.length - 1)) % menuItems.length)
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    pick(menuItems[Math.min(menuIndex, menuItems.length - 1)]!)
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    const chosen = menuItems[Math.min(menuIndex, menuItems.length - 1)]!
    if (`/${chosen.name}` !== text.trim()) {
      e.preventDefault()
      pick(chosen)
      return
    }
  }
}

// no JSX, acima do textarea:
<SlashMenu items={menuItems} activeIndex={Math.min(menuIndex, Math.max(menuItems.length - 1, 0))} onPick={pick} />
{notice && (
  <div data-testid="composer-notice" className="mb-1 flex items-center gap-2 rounded border border-amber-800 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
    <span className="flex-1">{notice.text}</span>
    <button
      className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-100 hover:bg-neutral-700"
      onClick={() => {
        useDock.getState().open({ type: 'terminal', projectPath, initialCommand: notice.command })
        setNotice(null)
      }}
    >
      Abrir em terminal
    </button>
  </div>
)}
```

(imports: `useEffect`, `SlashMenu`, `classifySlash`, `filterCommands`, `mergeCommands`, `slashQuery`, `type LocalCommand`, `type SlashItem`, `useDock`). Em `ModelSelect.tsx`, dar `id={\`model-select-${panelId}\`}` ao `<select>`.

- [ ] **Step 8: AgentPanel trata os comandos locais**

```tsx
// em AgentPanel.tsx
import { useState } from 'react'
import type { AgentEvent } from '@shared/agent'
import { currentAgentParams, replacePanelParams } from '../../stores/agentStore'
import type { LocalCommand } from '../../agent/slash'
import { ResumeModal } from './ResumeModal'

// dentro do componente:
const [resumeOpen, setResumeOpen] = useState(false)

const restart = async (next: AgentPanelParams, history: AgentEvent[] = []) => {
  await window.api.invoke('agent:close', panelId)
  useAgents.getState().clear(panelId)
  if (history.length > 0) useAgents.getState().load(panelId, history)
  replacePanelParams(panelId, next)
  await window.api.invoke('agent:create', panelId, next)
  if (!next.sessionId) await window.api.invoke('agent:start', panelId)
}

const base = (): AgentPanelParams => {
  const p = currentAgentParams(panelId) ?? params
  return { type: 'agent', projectPath: p.projectPath, ...(p.model ? { model: p.model } : {}), ...(p.permissionMode ? { permissionMode: p.permissionMode } : {}) }
}

const onLocalCommand = (name: LocalCommand) => {
  if (name === 'resume') setResumeOpen(true)
  else if (name === 'clear') void restart(base()).catch(fail)
  else if (name === 'model') document.getElementById(`model-select-${panelId}`)?.focus()
  // 'statusline' is handled in Task 11
}

const resume = (sessionId: string) => {
  setResumeOpen(false)
  void (async () => {
    const history = await window.api.invoke('agent:history', params.projectPath, sessionId)
    await restart({ ...base(), sessionId }, history)
  })().catch(fail)
}
```

(`fail` passa a ser uma função do componente: `const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: errorText(err) })`.) O container raiz ganha `relative`; renderizar `{resumeOpen && <ResumeModal projectPath={params.projectPath} onPick={resume} onClose={() => setResumeOpen(false)} />}` e passar `projectPath={params.projectPath}` e `onLocalCommand={onLocalCommand}` ao `Composer`.

- [ ] **Step 9: Verificar** — `npx vitest run test/renderer/slash.test.ts && npm run typecheck && npm test && npm run test:e2e` → verde.

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat: add slash command menu, /resume, /clear and tui-only notice"`

---

### Task 10: Colar, arrastar e anexar imagens no composer

**Files:**
- Create: `src/renderer/src/agent/images.ts`
- Modify: `src/renderer/src/panels/agent/Composer.tsx`
- Test: `test/renderer/images.test.ts`, `e2e/agent-images.spec.ts`

**Interfaces:**
- Consumes: `ImageAttachment`, `ImageMediaType` (Task 1), `onSend(text, images)` do Composer (Task 6).
- Produces: `MAX_IMAGE_BYTES = 5 * 1024 * 1024`, `validateImage(file: { name: string; type: string; size: number }): string | null`, `stripDataUrl(dataUrl: string): string`, `pickImageFiles(files: ArrayLike<File> | null | undefined): File[]`, `readImage(file: File): Promise<ImageAttachment>`.

Regras (spec §6.3): png/jpg/gif/webp, até 5 MB por imagem; miniatura removível antes de enviar; colar texto continua normal (só intercepta quando há arquivos de imagem); pode enviar só imagem, sem texto.

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/images.test.ts
import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, stripDataUrl, validateImage } from '@renderer/agent/images'

describe('validateImage', () => {
  it('accepts supported types within the size limit', () => {
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 10 })).toBeNull()
    expect(validateImage({ name: 'a.webp', type: 'image/webp', size: MAX_IMAGE_BYTES })).toBeNull()
  })
  it('rejects unsupported types and oversized files with pt-BR messages', () => {
    expect(validateImage({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toBe('a.svg: formato não suportado (use png, jpg, gif ou webp)')
    expect(validateImage({ name: 'b.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('b.png: maior que 5 MB')
  })
})

describe('stripDataUrl', () => {
  it('returns the base64 payload', () => {
    expect(stripDataUrl('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(stripDataUrl('AAAA')).toBe('AAAA')
  })
})
```

```ts
// e2e/agent-images.spec.ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('anexa imagem, remove, anexa de novo e envia', async () => {
  const { app, page } = await openAgent()
  const fileInput = page.getByTestId('image-input')
  await fileInput.setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'print.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Remover imagem print.png' }).click()
  await expect(page.getByRole('img', { name: 'print.png' })).toHaveCount(0)

  await fileInput.setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('veja')
  await input.press('Enter')
  await expect(page.getByTestId('user-bubble')).toContainText('1 imagem(ns)')
  await expect(page.getByRole('img', { name: 'print.png' })).toHaveCount(0)

  await fileInput.setInputFiles({ name: 'grande.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByTestId('composer-notice')).toContainText('formato não suportado')
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/images.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/renderer/src/agent/images.ts`**

```ts
import type { ImageAttachment, ImageMediaType } from '@shared/agent'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const SUPPORTED = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function validateImage(file: { name: string; type: string; size: number }): string | null {
  if (!SUPPORTED.has(file.type)) return `${file.name}: formato não suportado (use png, jpg, gif ou webp)`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: maior que 5 MB`
  return null
}

export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function pickImageFiles(files: ArrayLike<File> | null | undefined): File[] {
  return files ? Array.from(files).filter((f) => f.type.startsWith('image/')) : []
}

export function readImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`falha ao ler ${file.name}`))
    reader.onload = () => resolve({ name: file.name, mediaType: file.type as ImageMediaType, data: stripDataUrl(String(reader.result)) })
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 4: Composer** — alterações em `Composer.tsx`:

```tsx
// estado novo
const [images, setImages] = useState<ImageAttachment[]>([])
const fileInput = useRef<HTMLInputElement>(null)

const addFiles = (files: File[]) => {
  const errors: string[] = []
  const valid = files.filter((f) => {
    const error = validateImage(f)
    if (error) errors.push(error)
    return !error
  })
  if (errors.length) setNotice({ text: errors.join(' · '), command: '' })
  void Promise.all(valid.map(readImage))
    .then((read) => setImages((prev) => [...prev, ...read]))
    .catch((err) => setNotice({ text: String(err), command: '' }))
}

// submit: permitir envio só com imagem e limpar anexos
//   const value = text.trim()
//   if (!value && images.length === 0) return
//   ... (classifySlash só quando não há imagens)
//   onSend(value, images); setImages([])

// no container raiz do Composer:
//   onDragOver={(e) => e.preventDefault()}
//   onDrop={(e) => { const files = pickImageFiles(e.dataTransfer.files); if (files.length) { e.preventDefault(); addFiles(files) } }}
// no textarea:
//   onPaste={(e) => { const files = pickImageFiles(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files) } }}

// acima do textarea, miniaturas:
{images.length > 0 && (
  <div className="mb-1 flex flex-wrap gap-2">
    {images.map((img, i) => (
      <div key={`${img.name}-${i}`} className="relative">
        <img alt={img.name} src={`data:${img.mediaType};base64,${img.data}`} className="h-14 w-14 rounded border border-neutral-700 object-cover" />
        <button
          aria-label={`Remover imagem ${img.name}`}
          className="absolute -top-1 -right-1 rounded-full bg-neutral-800 px-1 text-[10px] text-neutral-200"
          onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
        >
          ×
        </button>
      </div>
    ))}
  </div>
)}

// na toolbar, antes do ModelSelect:
<button aria-label="Anexar imagem" className="rounded px-1 hover:bg-neutral-800" onClick={() => fileInput.current?.click()}>
  +img
</button>
<input
  ref={fileInput}
  data-testid="image-input"
  type="file"
  accept="image/png,image/jpeg,image/gif,image/webp"
  multiple
  hidden
  onChange={(e) => {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }}
/>
```

O aviso (`composer-notice`) passa a aceitar `command: ''` — nesse caso o botão "Abrir em terminal" não aparece (`{notice.command && <button …>}`). Imports: `validateImage`, `readImage`, `pickImageFiles`, `type ImageAttachment`. O `accept` inclui só os tipos suportados, mas `addFiles` valida de qualquer jeito (arrastar/colar ignoram `accept`); o teste E2E usa `setInputFiles`, que também ignora `accept`.

- [ ] **Step 5: Verificar** — `npx vitest run test/renderer/images.test.ts && npm run typecheck && npm test && npm run test:e2e` → verde.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: paste, drop and attach images in the agent composer"`

---

### Task 11: StatusLine configurável + script `statusLine` do usuário

**Files:**
- Create: `src/renderer/src/agent/statusline.ts`, `src/renderer/src/agent/ansi.ts`, `src/renderer/src/stores/settingsStore.ts`, `src/renderer/src/panels/agent/StatusLine.tsx`, `src/main/statusline/runStatusLine.ts`
- Modify: `src/shared/ipc-contract.ts` (`statusline:run`), `src/main/ipc/handlers.ts` (`statusline:run` + merge profundo de `settings.statusline`), `src/main/index.ts` (deps), `test/main/handlers.test.ts`, `src/renderer/src/panels/agent/AgentPanel.tsx`, `e2e/helpers.ts`
- Test: `test/renderer/statusline.test.ts`, `test/renderer/ansi.test.ts`, `test/main/runStatusLine.test.ts`, `e2e/agent-statusline.spec.ts`

**Interfaces:**
- Consumes: `StatusSegmentId`, `Settings`, `DEFAULT_SETTINGS` (Plano 1), `StatusLineInput`, `StatsEvent` (Task 1), `ChatState` (Task 3), `MODE_OPTIONS` (Task 8), `useGitBranch` (Plano 1, `src/renderer/src/sidebar/useGitBranch.ts`).
- Produces:
  - `SEGMENT_LABELS: Record<StatusSegmentId, string>`, `type StatusContext`, `buildSegments(ids: StatusSegmentId[], ctx: StatusContext): Array<{ id: StatusSegmentId; text: string }>`, `formatCost(usd: number): string`, `formatDuration(ms: number): string`, `formatTokens(n: number): string`, `buildStatusLineInput(ctx: StatusContext & { sessionId?: string; cwd: string }): StatusLineInput`
  - `type AnsiSpan = { text: string; color?: string; bold?: boolean; dim?: boolean }`, `ansiToSpans(text: string): AnsiSpan[]`
  - `useSettings` (zustand): `{ settings: Settings; loaded: boolean; load(): Promise<void>; update(patch: Partial<Settings>): void }`
  - `runStatusLine(input: StatusLineInput, opts?: { settingsPath?: string; shell?: string; timeoutMs?: number }): Promise<string | null>`
  - Canal `'statusline:run': { args: [input: StatusLineInput]; result: string | null }`
  - `<StatusLine panelId projectPath chat configOpen onConfigClose>`

`StatusContext = { projectName: string; branch: string | null; model?: string; contextPct?: number; tokens: number; costUsd: number; durationMs?: number; mode?: PermissionMode; state: SessionState }`. Segmentos sem dado são omitidos (ex.: sem `contextPct` → sem segmento `context`). `customScript` não vira segmento de texto: quando ligado, a saída ANSI do script aparece à direita.

Hermético nos testes: `e2e/helpers.ts` passa `NEXT_IDE_CLAUDE_SETTINGS=<tempdir>/claude-settings.json` (arquivo inexistente) por padrão; o main usa essa variável como `settingsPath` quando definida, senão `~/.claude/settings.json`.

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/statusline.test.ts
import { describe, expect, it } from 'vitest'
import { buildSegments, buildStatusLineInput, formatCost, formatDuration, formatTokens } from '@renderer/agent/statusline'

const ctx = { projectName: 'api', branch: 'dev', model: 'opus', contextPct: 29, tokens: 288_000, costUsd: 0.4213, durationMs: 73_000, mode: 'plan' as const, state: 'running' as const }

describe('formatters', () => {
  it('formats cost, duration and tokens', () => {
    expect(formatCost(0.4213)).toBe('$0.42')
    expect(formatCost(0)).toBe('$0.00')
    expect(formatDuration(73_000)).toBe('1m13s')
    expect(formatDuration(900)).toBe('0.9s')
    expect(formatTokens(288_000)).toBe('288k')
    expect(formatTokens(950)).toBe('950')
  })
})

describe('buildSegments', () => {
  it('renders the chosen segments in order and skips missing data', () => {
    expect(buildSegments(['project', 'branch', 'model', 'context', 'cost', 'duration', 'mode', 'state', 'tokens'], ctx).map((s) => s.text)).toEqual([
      'api', 'dev', 'opus', 'contexto 29%', '$0.42', '1m13s', 'Plano', 'rodando', '288k tokens',
    ])
    expect(buildSegments(['branch', 'context', 'customScript'], { ...ctx, branch: null, contextPct: undefined }).map((s) => s.id)).toEqual([])
  })
})

describe('buildStatusLineInput', () => {
  it('maps to the Claude Code statusLine JSON shape', () => {
    expect(buildStatusLineInput({ ...ctx, sessionId: 's1', cwd: '/g/api' })).toEqual({
      session_id: 's1',
      cwd: '/g/api',
      model: { id: 'opus', display_name: 'opus' },
      workspace: { current_dir: '/g/api', project_dir: '/g/api' },
      cost: { total_cost_usd: 0.4213, total_duration_ms: 73_000 },
      context_window: { context_window_size: 0, used_percentage: 29, total_input_tokens: 288_000 },
    })
  })
})
```

```ts
// test/renderer/ansi.test.ts
import { describe, expect, it } from 'vitest'
import { ansiToSpans } from '@renderer/agent/ansi'

describe('ansiToSpans', () => {
  it('parses basic colors, bold, dim, reset and 24-bit/256 colors', () => {
    expect(ansiToSpans('\x1b[32mok\x1b[0m done')).toEqual([{ text: 'ok', color: '#4ade80' }, { text: ' done' }])
    expect(ansiToSpans('\x1b[1;31mX')).toEqual([{ text: 'X', color: '#f87171', bold: true }])
    expect(ansiToSpans('\x1b[2mdim')).toEqual([{ text: 'dim', dim: true }])
    expect(ansiToSpans('\x1b[38;2;255;0;128mrgb')).toEqual([{ text: 'rgb', color: 'rgb(255,0,128)' }])
    expect(ansiToSpans('\x1b[38;5;196mred')).toEqual([{ text: 'red', color: 'rgb(255,0,0)' }])
    expect(ansiToSpans('plain')).toEqual([{ text: 'plain' }])
  })
})
```

```ts
// test/main/runStatusLine.test.ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runStatusLine } from '../../src/main/statusline/runStatusLine'

const input = {
  session_id: 's',
  cwd: '/p',
  model: { id: 'm', display_name: 'M' },
  workspace: { current_dir: '/p', project_dir: '/p' },
  cost: { total_cost_usd: 0, total_duration_ms: 0 },
}
const settings = (command: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-'))
  const path = join(dir, 'settings.json')
  writeFileSync(path, JSON.stringify({ statusLine: { type: 'command', command } }))
  return path
}

describe('runStatusLine', () => {
  it('runs the command with the JSON on stdin and returns trimmed stdout', async () => {
    const out = await runStatusLine(input, { settingsPath: settings('cat | grep -o "\\"display_name\\":\\"M\\""'), shell: '/bin/sh' })
    expect(out).toBe('"display_name":"M"')
  })
  it('returns null without a configured command, on failure and on timeout', async () => {
    expect(await runStatusLine(input, { settingsPath: '/nope/settings.json', shell: '/bin/sh' })).toBeNull()
    expect(await runStatusLine(input, { settingsPath: settings('exit 3'), shell: '/bin/sh' })).toBeNull()
    expect(await runStatusLine(input, { settingsPath: settings('sleep 5'), shell: '/bin/sh', timeoutMs: 200 })).toBeNull()
  })
})
```

Em `test/main/handlers.test.ts`: adicionar `runStatusLine: async () => 'linha'` ao `deps()` e:

```ts
it('settings:get deep-merges statusline defaults', async () => {
  const d = deps()
  await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, statusline: { customScript: true } as never })
  const s = await buildHandlers(d)['settings:get']()
  expect(s.statusline).toEqual({ segments: DEFAULT_SETTINGS.statusline.segments, customScript: true })
})

it('statusline:run delegates to the runner', async () => {
  expect(await buildHandlers(deps())['statusline:run']({} as never)).toBe('linha')
})
```

```ts
// e2e/agent-statusline.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('statusline mostra modelo, custo e script do usuário', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-settings-'))
  const settingsPath = join(dir, 'settings.json')
  writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: "printf '\\033[32mSCRIPT OK\\033[0m'" } }))
  const { app, page } = await openAgent({ env: { NEXT_IDE_CLAUDE_SETTINGS: settingsPath } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('oi')
  await input.press('Enter')
  const bar = page.getByTestId('status-line')
  await expect(bar).toContainText('fake-model')
  await expect(bar).toContainText('$0.01')

  await input.fill('/statusline')
  await input.press('Enter')
  const config = page.getByRole('dialog', { name: 'Configurar statusline' })
  await config.getByRole('checkbox', { name: 'custo' }).uncheck()
  await config.getByRole('checkbox', { name: 'script do ~/.claude (statusLine)' }).check()
  await config.getByRole('button', { name: 'Fechar' }).click()
  await expect(bar).not.toContainText('$0.01')
  await expect(bar.getByText('SCRIPT OK')).toHaveCSS('color', 'rgb(74, 222, 128)')
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/statusline.test.ts test/renderer/ansi.test.ts test/main/runStatusLine.test.ts test/main/handlers.test.ts` → FAIL.

- [ ] **Step 3: Implementar lógica pura**

```ts
// src/renderer/src/agent/statusline.ts
import type { StatusLineInput } from '@shared/agent'
import type { PermissionMode, SessionState, StatusSegmentId } from '@shared/models'
import { MODE_OPTIONS } from './permissions'

export type StatusContext = {
  projectName: string
  branch: string | null
  model?: string
  contextPct?: number
  tokens: number
  costUsd: number
  durationMs?: number
  mode?: PermissionMode
  state: SessionState
}

export const SEGMENT_LABELS: Record<StatusSegmentId, string> = {
  project: 'projeto',
  branch: 'branch',
  model: 'modelo',
  context: 'contexto %',
  tokens: 'tokens',
  cost: 'custo',
  duration: 'duração',
  mode: 'modo',
  state: 'estado',
  customScript: 'script do ~/.claude (statusLine)',
}

const STATE_LABELS: Record<SessionState, string> = {
  starting: 'iniciando',
  idle: 'ocioso',
  running: 'rodando',
  awaiting_permission: 'aguardando você',
  error: 'erro',
  exited: 'encerrado',
}

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`
export const formatTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}

export function buildSegments(ids: StatusSegmentId[], ctx: StatusContext): Array<{ id: StatusSegmentId; text: string }> {
  const text = (id: StatusSegmentId): string | null => {
    switch (id) {
      case 'project':
        return ctx.projectName
      case 'branch':
        return ctx.branch
      case 'model':
        return ctx.model ?? null
      case 'context':
        return ctx.contextPct === undefined ? null : `contexto ${ctx.contextPct}%`
      case 'tokens':
        return ctx.tokens > 0 ? `${formatTokens(ctx.tokens)} tokens` : null
      case 'cost':
        return formatCost(ctx.costUsd)
      case 'duration':
        return ctx.durationMs === undefined ? null : formatDuration(ctx.durationMs)
      case 'mode':
        return ctx.mode ? (MODE_OPTIONS.find((m) => m.value === ctx.mode)?.label ?? ctx.mode) : null
      case 'state':
        return STATE_LABELS[ctx.state]
      case 'customScript':
        return null
    }
  }
  return ids.flatMap((id) => {
    const value = text(id)
    return value ? [{ id, text: value }] : []
  })
}

export function buildStatusLineInput(ctx: StatusContext & { sessionId?: string; cwd: string }): StatusLineInput {
  return {
    session_id: ctx.sessionId ?? '',
    cwd: ctx.cwd,
    model: { id: ctx.model ?? '', display_name: ctx.model ?? '' },
    workspace: { current_dir: ctx.cwd, project_dir: ctx.cwd },
    cost: { total_cost_usd: ctx.costUsd, total_duration_ms: ctx.durationMs ?? 0 },
    ...(ctx.contextPct !== undefined
      ? { context_window: { context_window_size: 0, used_percentage: ctx.contextPct, total_input_tokens: ctx.tokens } }
      : {}),
  }
}
```

```ts
// src/renderer/src/agent/ansi.ts
export type AnsiSpan = { text: string; color?: string; bold?: boolean; dim?: boolean }

const BASIC = ['#404040', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#c084fc', '#22d3ee', '#e5e5e5']
const BRIGHT = ['#737373', '#fca5a5', '#86efac', '#fde047', '#93c5fd', '#d8b4fe', '#67e8f9', '#ffffff']

function color256(n: number): string {
  if (n < 8) return BASIC[n]!
  if (n < 16) return BRIGHT[n - 8]!
  if (n < 232) {
    const i = n - 16
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return `rgb(${level(Math.floor(i / 36))},${level(Math.floor((i % 36) / 6))},${level(i % 6)})`
  }
  const gray = 8 + (n - 232) * 10
  return `rgb(${gray},${gray},${gray})`
}

type Style = Omit<AnsiSpan, 'text'>

function applyCodes(style: Style, codes: number[]): Style {
  let next: Style = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!
    if (c === 0) next = {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 22) {
      delete next.bold
      delete next.dim
    } else if (c === 39) delete next.color
    else if (c >= 30 && c <= 37) next.color = BASIC[c - 30]
    else if (c >= 90 && c <= 97) next.color = BRIGHT[c - 90]
    else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      next.color = color256(codes[i + 2]!)
      i += 2
    } else if (c === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
      next.color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
      i += 4
    }
  }
  return next
}

export function ansiToSpans(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = []
  let style: Style = {}
  const re = /\x1b\[([0-9;]*)m/g
  let last = 0
  let match: RegExpExecArray | null
  const pushText = (chunk: string) => {
    if (chunk) spans.push({ text: chunk, ...style })
  }
  while ((match = re.exec(text))) {
    pushText(text.slice(last, match.index))
    style = applyCodes(style, match[1] ? match[1].split(';').map(Number) : [0])
    last = re.lastIndex
  }
  pushText(text.slice(last))
  return spans
}
```

- [ ] **Step 4: Main — runner, canal e merge profundo**

```ts
// src/main/statusline/runStatusLine.ts
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { StatusLineInput } from '@shared/agent'

async function readCommand(settingsPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8')) as { statusLine?: { type?: string; command?: string } }
    return parsed.statusLine?.type === 'command' && parsed.statusLine.command ? parsed.statusLine.command : null
  } catch {
    return null
  }
}

/** Runs the user's Claude Code statusLine command with next-ide's JSON on stdin (same contract as the CLI). */
export async function runStatusLine(
  input: StatusLineInput,
  opts: { settingsPath?: string; shell?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const command = await readCommand(opts.settingsPath ?? join(homedir(), '.claude', 'settings.json'))
  if (!command) return null
  return new Promise((resolve) => {
    const child = spawn(opts.shell ?? (process.env.SHELL || '/bin/zsh'), ['-lc', command], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, opts.timeoutMs ?? 2000)
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? out.replace(/\s+$/, '') || null : null)
    })
    child.stdin.end(JSON.stringify(input))
  })
}
```

No contrato: `'statusline:run': { args: [input: StatusLineInput]; result: string | null }` + nome em `INVOKE_CHANNELS`. Em `handlers.ts`: `HandlerDeps.runStatusLine: (input: StatusLineInput) => Promise<string | null>`; handler `'statusline:run': (input) => d.runStatusLine(input)`; e `settings:get` passa a ser

```ts
    'settings:get': async () => {
      const stored = await d.stores.settings.read()
      return { ...DEFAULT_SETTINGS, ...stored, statusline: { ...DEFAULT_SETTINGS.statusline, ...stored.statusline } }
    },
```

Em `index.ts`: `runStatusLine: (input) => runStatusLine(input, process.env.NEXT_IDE_CLAUDE_SETTINGS ? { settingsPath: process.env.NEXT_IDE_CLAUDE_SETTINGS } : {})`. Em `e2e/helpers.ts`, o env padrão de `launch` ganha `NEXT_IDE_CLAUDE_SETTINGS: join(<tempdir do launch>, 'claude-settings.json')` (arquivo inexistente; `opts.env` sobrescreve).

- [ ] **Step 5: Settings store e componente**

```ts
// src/renderer/src/stores/settingsStore.ts
import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '@shared/models'

type SettingsState = { settings: Settings; loaded: boolean; load(): Promise<void>; update(patch: Partial<Settings>): void }

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    if (get().loaded) return
    set({ settings: await window.api.invoke('settings:get'), loaded: true })
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void window.api.invoke('settings:save', settings).catch((err) => console.error('[next-ide] failed to save settings', err))
  },
}))
```

```tsx
// src/renderer/src/panels/agent/StatusLine.tsx
import { useEffect, useMemo, useState } from 'react'
import { basename } from '@shared/workspaces'
import type { StatusSegmentId } from '@shared/models'
import type { ChatState } from '../../agent/chatReducer'
import { ansiToSpans } from '../../agent/ansi'
import { SEGMENT_LABELS, buildSegments, buildStatusLineInput, type StatusContext } from '../../agent/statusline'
import { useSettings } from '../../stores/settingsStore'
import { useGitBranch } from '../../sidebar/useGitBranch'

const ALL: StatusSegmentId[] = ['project', 'branch', 'model', 'context', 'tokens', 'cost', 'duration', 'mode', 'state']

type Props = { projectPath: string; chat: ChatState; configOpen: boolean; onConfigClose(): void; onConfigOpen(): void }

export function StatusLine({ projectPath, chat, configOpen, onConfigClose, onConfigOpen }: Props) {
  const settings = useSettings((s) => s.settings)
  const branch = useGitBranch(projectPath)
  const [scriptOut, setScriptOut] = useState<string | null>(null)
  useEffect(() => void useSettings.getState().load(), [])

  const usage = chat.stats?.usage
  const ctx: StatusContext = {
    projectName: basename(projectPath),
    branch,
    ...(chat.model ? { model: chat.model } : {}),
    ...(chat.stats?.contextPct !== undefined ? { contextPct: chat.stats.contextPct } : {}),
    tokens: usage ? usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens : 0,
    costUsd: chat.totalCostUsd,
    ...(chat.stats ? { durationMs: chat.stats.durationMs } : {}),
    ...(chat.permissionMode ? { mode: chat.permissionMode } : {}),
    state: chat.state,
  }
  const segments = buildSegments(settings.statusline.segments, ctx)

  useEffect(() => {
    if (!settings.statusline.customScript) return setScriptOut(null)
    window.api
      .invoke('statusline:run', buildStatusLineInput({ ...ctx, cwd: projectPath, ...(chat.sessionId ? { sessionId: chat.sessionId } : {}) }))
      .then(setScriptOut)
      .catch(() => setScriptOut(null))
    // Re-run after each turn (stats), on model/mode change, or when the toggle flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.statusline.customScript, chat.stats, chat.model, chat.permissionMode])

  const spans = useMemo(() => (scriptOut ? ansiToSpans(scriptOut) : []), [scriptOut])
  const toggle = (id: StatusSegmentId, on: boolean) => {
    const current = settings.statusline.segments
    const segments = on ? ALL.filter((s) => s === id || current.includes(s)) : current.filter((s) => s !== id)
    useSettings.getState().update({ statusline: { ...settings.statusline, segments } })
  }

  return (
    <div className="relative border-t border-neutral-900 px-3 py-1 text-[11px] text-neutral-500" data-testid="status-line">
      <div className="flex items-center gap-2">
        <span className="truncate">{segments.map((s) => s.text).join(' · ')}</span>
        <span className="ml-auto truncate font-mono">
          {spans.map((s, i) => (
            <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
              {s.text}
            </span>
          ))}
        </span>
        <button aria-label="Configurar statusline" className="rounded px-1 hover:bg-neutral-800" onClick={onConfigOpen}>
          ⚙
        </button>
      </div>
      {configOpen && (
        <div role="dialog" aria-label="Configurar statusline" className="absolute right-2 bottom-7 z-10 w-64 rounded border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-300">
          {ALL.map((id) => (
            <label key={id} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={settings.statusline.segments.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
              {SEGMENT_LABELS[id]}
            </label>
          ))}
          <label className="mt-2 flex items-center gap-2 border-t border-neutral-800 pt-2">
            <input
              type="checkbox"
              checked={settings.statusline.customScript}
              onChange={(e) => useSettings.getState().update({ statusline: { ...settings.statusline, customScript: e.target.checked } })}
            />
            {SEGMENT_LABELS.customScript}
          </label>
          <button className="mt-2 rounded bg-neutral-800 px-2 py-0.5 hover:bg-neutral-700" onClick={onConfigClose}>
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
```

Em `AgentPanel.tsx`: estado `const [statusConfig, setStatusConfig] = useState(false)`; `onLocalCommand('statusline')` → `setStatusConfig(true)`; renderizar depois do `Composer`: `<StatusLine projectPath={params.projectPath} chat={chat} configOpen={statusConfig} onConfigOpen={() => setStatusConfig(true)} onConfigClose={() => setStatusConfig(false)} />`.

- [ ] **Step 6: Verificar** — `npx vitest run test/renderer test/main && npm run typecheck && npm test && npm run test:e2e` → verde.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: add configurable statusline with the user's statusLine script"`

<!-- TASKS 12+ APPENDED BELOW -->
