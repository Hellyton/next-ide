# Plano 4A — Segurança e contexto (rewind, /context, esforço, /rename) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer para o painel do agente `/rewind` (checkpoints de arquivo + volta da conversa), `/context`, seletor de esforço (`/effort`) e `/rename`, com o mesmo comportamento do Claude Code CLI.

**Architecture:** Mesmo padrão do `/btw` (commit 9d478e0): `QueryLike` ganha métodos opcionais do SDK; `AgentSession` expõe um método por recurso que devolve resultado tipado (`{ ok: false, message }` quando falta suporte ou dá erro); um canal IPC por operação; renderer com comandos locais em `slash.ts`, modais no estilo do `ResumeModal` e seletor no estilo do `ModelSelect`. Voltar a conversa usa `forkSession(upToMessageId)` + `restartSession` já existente.

**Tech Stack:** Electron + React + zustand + Tailwind; `@anthropic-ai/claude-agent-sdk` 0.3.268; vitest; Playwright (`NEXT_IDE_FAKE_AGENT=1` → `fakeQuery`).

**Spec:** `docs/superpowers/specs/2026-09-25-next-ide-paridade-cli-design.md` (seções 3 e 4).

## Global Constraints

- Branch: `fix/ajustes-visuais` (o usuário pediu a branch atual). Um commit por tarefa, mensagem em inglês no estilo `feat: ...`, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Textos de UI em português (pt-BR), como o resto do app.
- Método do SDK ausente → `{ ok: false, message: '<recurso> não é suportado por esta versão do Claude Code.' }`, mostrado no `composer-notice`; nunca derruba o painel.
- Operações que reiniciam a query (voltar conversa) são recusadas com o agente em `running` ou `awaiting_permission`.
- Não adicionar dependências.
- Comandos: `npm run typecheck`, `npx vitest run <arquivo>`, e2e: `npx electron-vite build && npx playwright test <spec>`.
- E2E: o spec `e2e/file-edit.spec.ts` é instável só na suíte cheia (pré-existente); se falhar, rodar isolado antes de concluir que quebrou.

## Review Focus

1. Rewind numa sessão restaurada (painel reaberto, query ainda não iniciada): `rewindFiles` precisa iniciar a query (`claude --resume`) antes; se o CLI não tiver checkpoint, o modal mostra o erro do SDK e mantém "Só conversa" disponível — Task 4 e Task 6.
2. Voltar para a **primeira** mensagem da sessão: não há ponto de fork; o painel vira sessão nova com o texto no composer (equivale a `/clear`) — Task 5 e Task 6.
3. `/rename` antes da primeira mensagem (sem transcript): aviso, sem chamar o SDK — Task 7.
4. Trocar esforço com a query já rodando e depois reiniciar (resume/crash): o nível tem que sobreviver no `effort` da próxima query e no layout — Task 2.
5. Esc Esc com texto no composer ou com o agente rodando **não** abre o rewind (Esc com agente rodando continua interrompendo) — Task 6.

---

### Task 1: Comandos locais com argumento

**Files:**
- Modify: `src/renderer/src/agent/slash.ts`
- Modify: `src/renderer/src/panels/agent/Composer.tsx` (chamada de `onLocalCommand`)
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx` (assinatura de `onLocalCommand`)
- Test: `test/renderer/slash.test.ts`

**Interfaces:**
- Produces:
  - `type LocalCommand = 'resume' | 'clear' | 'model' | 'statusline' | 'rewind' | 'context' | 'effort' | 'rename'`
  - `SlashAction` variante local passa a ser `{ kind: 'local'; name: LocalCommand; arg: string }` (`arg` trimado, `''` se ausente)
  - `Composer` prop `onLocalCommand(name: LocalCommand, arg: string): void`
  - `LOCAL_COMMANDS` com os 4 novos itens (ordem abaixo)

- [ ] **Step 1: Write the failing test** — em `test/renderer/slash.test.ts`, trocar o `describe('classifySlash')` e a lista esperada em `mergeCommands`:

```ts
// dentro de describe('mergeCommands / filterCommands'), substituir o expect da lista:
    expect(merged.map((c) => c.name)).toEqual([
      'resume', 'clear', 'model', 'statusline', 'btw', 'rewind', 'context', 'effort', 'rename', 'compact', 'review',
    ])
```

```ts
describe('classifySlash', () => {
  it('routes local, tui-only and pass-through commands', () => {
    expect(classifySlash('/resume')).toEqual({ kind: 'local', name: 'resume', arg: '' })
    expect(classifySlash('  /clear  ')).toEqual({ kind: 'local', name: 'clear', arg: '' })
    expect(classifySlash('/login')).toEqual({ kind: 'tui', name: 'login' })
    expect(classifySlash('/compact foco em testes')).toEqual({ kind: 'send' })
    expect(classifySlash('oi')).toEqual({ kind: 'send' })
  })
  it('passes the argument of local commands', () => {
    expect(classifySlash('/rename  Refactor do login ')).toEqual({ kind: 'local', name: 'rename', arg: 'Refactor do login' })
    expect(classifySlash('/effort high')).toEqual({ kind: 'local', name: 'effort', arg: 'high' })
    expect(classifySlash('/rewind')).toEqual({ kind: 'local', name: 'rewind', arg: '' })
    expect(classifySlash('/context')).toEqual({ kind: 'local', name: 'context', arg: '' })
  })
  it('routes /btw with its (multi-line) question, even an empty one', () => {
    expect(classifySlash('/btw qual arquivo você está editando?')).toEqual({ kind: 'btw', question: 'qual arquivo você está editando?' })
    expect(classifySlash('/btw linha 1\nlinha 2')).toEqual({ kind: 'btw', question: 'linha 1\nlinha 2' })
    expect(classifySlash('/btw')).toEqual({ kind: 'btw', question: '' })
    expect(classifySlash('/btwx')).toEqual({ kind: 'send' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/renderer/slash.test.ts`
Expected: FAIL (lista sem os novos comandos; `arg` ausente).

- [ ] **Step 3: Write minimal implementation** — em `src/renderer/src/agent/slash.ts`:

```ts
export type LocalCommand = 'resume' | 'clear' | 'model' | 'statusline' | 'rewind' | 'context' | 'effort' | 'rename'
export type SlashAction =
  | { kind: 'local'; name: LocalCommand; arg: string }
  | { kind: 'btw'; question: string }
  | { kind: 'tui'; name: string }
  | { kind: 'send' }

export const LOCAL_COMMANDS: SlashItem[] = [
  { name: 'resume', description: 'Retomar uma sessão anterior deste projeto', argumentHint: '', local: true },
  { name: 'clear', description: 'Começar uma conversa nova neste painel', argumentHint: '', local: true },
  { name: 'model', description: 'Trocar o modelo', argumentHint: '', local: true },
  { name: 'statusline', description: 'Configurar a barra de status', argumentHint: '', local: true },
  { name: 'btw', description: 'Pergunta rápida paralela, sem entrar na conversa', argumentHint: '<pergunta>', local: true },
  { name: 'rewind', description: 'Voltar código e/ou conversa a uma mensagem anterior', argumentHint: '', local: true },
  { name: 'context', description: 'Ver o uso do contexto', argumentHint: '', local: true },
  { name: 'effort', description: 'Nível de esforço do modelo', argumentHint: '[low|medium|high|xhigh|max|auto]', local: true },
  { name: 'rename', description: 'Renomear esta sessão', argumentHint: '<título>', local: true },
]
```

E a parte local do `classifySlash` (mantendo o bloco `/btw` que já está no topo):

```ts
export function classifySlash(text: string): SlashAction {
  const btw = BTW.exec(text.trim())
  if (btw) return { kind: 'btw', question: (btw[1] ?? '').trim() }
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return { kind: 'send' }
  const name = match[1]!
  const arg = (match[2] ?? '').trim()
  if (LOCAL_NAMES.has(name)) return { kind: 'local', name: name as LocalCommand, arg }
  if (!arg && TUI_ONLY.has(name)) return { kind: 'tui', name }
  return { kind: 'send' }
}
```

Nota: `LOCAL_NAMES` inclui `btw`, mas o `BTW` regex já retornou antes, então `btw` nunca cai no ramo local.

- [ ] **Step 4: Atualizar chamadores**

`src/renderer/src/panels/agent/Composer.tsx` — tipo da prop e chamada:

```ts
  onLocalCommand(name: LocalCommand, arg: string): void
```

```ts
      if (action.kind === 'local') {
        setText('')
        onLocalCommand(action.name, action.arg)
        return
      }
```

`src/renderer/src/panels/agent/AgentPanel.tsx` — por ora só a assinatura (os novos nomes ganham tratamento nas próximas tarefas):

```ts
  const onLocalCommand = (name: LocalCommand, _arg: string) => {
    if (name === 'resume') setResumeOpen(true)
    else if (name === 'clear') void restart(base()).catch(fail)
    else if (name === 'model') document.getElementById(`model-select-${panelId}`)?.focus()
    else if (name === 'statusline') setStatusConfig(true)
  }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run test/renderer/slash.test.ts && npm run typecheck`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/agent/slash.ts src/renderer/src/panels/agent/Composer.tsx src/renderer/src/panels/agent/AgentPanel.tsx test/renderer/slash.test.ts
git commit -m "feat: local slash commands take an argument; register rewind/context/effort/rename

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nível de esforço (`/effort` + seletor)

**Files:**
- Modify: `src/shared/models.ts` (tipo `EffortLevel`, `AgentPanelParams.effort`)
- Modify: `src/shared/agent.ts` (evento `effort`)
- Modify: `src/shared/ipc-contract.ts` (`agent:setEffort`)
- Modify: `src/main/agent/AgentSession.ts` (opção `effort`, `applyFlagSettings`, `setEffort`)
- Modify: `src/main/agent/AgentManager.ts` (passa `effort`, emite estado inicial)
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/agent/fakeQuery.ts` (`applyFlagSettings`)
- Modify: `src/renderer/src/agent/chatReducer.ts` (`ChatState.effort`)
- Modify: `src/renderer/src/stores/agentStore.ts` (persistir `effort`)
- Create: `src/renderer/src/panels/agent/EffortSelect.tsx`
- Modify: `src/renderer/src/panels/agent/Composer.tsx` (renderiza `EffortSelect`)
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx` (`/effort`)
- Test: `test/main/AgentSession.test.ts`, `test/renderer/chatReducer.test.ts`, `e2e/agent-effort.spec.ts`

**Interfaces:**
- Consumes: `onLocalCommand(name, arg)` (Task 1).
- Produces:
  - `export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const; export type EffortLevel = (typeof EFFORT_LEVELS)[number]` em `@shared/models`
  - `AgentPanelParams.effort?: EffortLevel`
  - `AgentEvent` `{ kind: 'effort'; effort: EffortLevel | null }` (`null` = automático)
  - `SessionConfig.effort?: EffortLevel`; `QueryOptions.effort?: EffortLevel`; `QueryLike.applyFlagSettings?(s: { effortLevel?: EffortLevel | null }): Promise<void>`
  - `AgentSession.setEffort(effort: EffortLevel | null): Promise<void>`
  - IPC `'agent:setEffort': { args: [panelId: string, effort: EffortLevel | null]; result: void }`
  - `ChatState.effort?: EffortLevel | null`
  - Componente `EffortSelect({ panelId, effort })` com `id="effort-select-<panelId>"`, `aria-label="Esforço"`

- [ ] **Step 1: Write the failing tests**

Em `test/main/AgentSession.test.ts`, dentro do `describe('AgentSession')` (use o helper `fake()`/`session()` do topo do arquivo):

```ts
  it('passes effort on start and applies it live through applyFlagSettings', async () => {
    const f = fake()
    const apply = vi.fn(async () => undefined)
    f.q.applyFlagSettings = apply
    const { s, events } = session(f.fn, { effort: 'high' })
    s.start()
    expect(f.calls[0]!.options.effort).toBe('high')
    await s.setEffort('low')
    expect(apply).toHaveBeenCalledWith({ effortLevel: 'low' })
    expect(events).toContainEqual({ kind: 'effort', effort: 'low' })
    await s.setEffort(null)
    expect(apply).toHaveBeenLastCalledWith({ effortLevel: null })
  })

  it('keeps effort for the next query when set before start, and survives a restart', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await s.setEffort('max')
    s.start()
    expect(f.calls[0]!.options.effort).toBe('max')
  })

  it('rejects and keeps the previous effort when applyFlagSettings fails', async () => {
    const f = fake()
    f.q.applyFlagSettings = async () => {
      throw new Error('nope')
    }
    const { s, events } = session(f.fn, { effort: 'medium' })
    s.start()
    await expect(s.setEffort('max')).rejects.toThrow('nope')
    expect(events.some((e) => e.kind === 'effort')).toBe(false)
  })
```

Em `test/renderer/chatReducer.test.ts`:

```ts
  it('tracks the effort level', () => {
    const s = reduceChat(initialChat, { kind: 'effort', effort: 'high' })
    expect(s.effort).toBe('high')
    expect(reduceChat(s, { kind: 'effort', effort: null }).effort).toBeNull()
  })
```

(Se o arquivo ainda não importa `initialChat`/`reduceChat`, importar de `@renderer/agent/chatReducer`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/AgentSession.test.ts test/renderer/chatReducer.test.ts`
Expected: FAIL (`setEffort` não existe / tipo `effort` desconhecido).

- [ ] **Step 3: Shared types**

`src/shared/models.ts` (logo após `PermissionMode`):

```ts
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type EffortLevel = (typeof EFFORT_LEVELS)[number]
export const isEffortLevel = (v: string): v is EffortLevel => (EFFORT_LEVELS as readonly string[]).includes(v)
```

e em `AgentPanelParams` adicionar `effort?: EffortLevel`.

`src/shared/agent.ts`: importar `EffortLevel` junto de `PermissionMode` e adicionar à união `AgentEvent`:

```ts
  | { kind: 'effort'; effort: EffortLevel | null }
```

`src/shared/ipc-contract.ts`: importar `EffortLevel` de `./models`; em `InvokeMap` após `'agent:setMode'`:

```ts
  'agent:setEffort': { args: [panelId: string, effort: EffortLevel | null]; result: void }
```

e `'agent:setEffort',` em `INVOKE_CHANNELS` após `'agent:setMode',`.

- [ ] **Step 4: Main**

`src/main/agent/AgentSession.ts`:
- importar `EffortLevel` de `@shared/models`;
- `QueryOptions` ganha `effort?: EffortLevel`;
- `QueryLike` ganha `applyFlagSettings?(settings: { effortLevel?: EffortLevel | null }): Promise<void>`;
- `SessionConfig` ganha `effort?: EffortLevel`;
- campo `private effort?: EffortLevel` inicializado no construtor com `this.effort = config.effort`;
- em `start()`, nas opções: `...(this.effort ? { effort: this.effort } : {}),`;
- método novo, logo após `setMode`:

```ts
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
```

`src/main/agent/AgentManager.ts` — no objeto de config: `...(params.effort ? { effort: params.effort } : {}),` e, depois do emit de `mode`:

```ts
    this.deps.emit(panelId, { kind: 'effort', effort: params.effort ?? null })
```

(O teste `test/main/AgentManager.test.ts` que conta eventos emitidos no `create` pode precisar incluir esse evento: rode-o e ajuste o valor esperado para `[{ kind: 'mode', ... }, { kind: 'effort', effort: null }]`.)

`src/main/ipc/handlers.ts` após `'agent:setMode'`:

```ts
    'agent:setEffort': (panelId, effort) => d.agents.get(panelId).setEffort(effort),
```

`src/main/agent/fakeQuery.ts` — no `Object.assign`: `applyFlagSettings: async () => undefined,`

- [ ] **Step 5: Renderer state**

`src/renderer/src/agent/chatReducer.ts`: `ChatState` ganha `effort?: EffortLevel | null` (importar tipo de `@shared/models`); no `switch`:

```ts
    case 'effort':
      return { ...s, effort: e.effort }
```

`src/renderer/src/stores/agentStore.ts` em `handleAgentEvent`, junto dos outros `persistParams`:

```ts
  if (event.kind === 'effort') persistParams(panelId, { effort: event.effort ?? undefined })
```

- [ ] **Step 6: EffortSelect**

Create `src/renderer/src/panels/agent/EffortSelect.tsx`:

```tsx
import { EFFORT_LEVELS, type EffortLevel } from '@shared/models'

const LABEL: Record<EffortLevel, string> = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo' }

export function EffortSelect({ panelId, effort }: { panelId: string; effort: EffortLevel | null | undefined }) {
  return (
    <select
      id={`effort-select-${panelId}`}
      aria-label="Esforço"
      className="rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={effort ?? ''}
      onChange={(e) => {
        const value = e.target.value
        void window.api
          .invoke('agent:setEffort', panelId, value ? (value as EffortLevel) : null)
          .catch((err) => console.error('[next-ide] setEffort failed', err))
      }}
    >
      <option value="">esforço auto</option>
      {EFFORT_LEVELS.map((level) => (
        <option key={level} value={level}>
          esforço {LABEL[level]}
        </option>
      ))}
    </select>
  )
}
```

Em `Composer.tsx`, importar e renderizar logo depois de `<ModelSelect ... />`:

```tsx
        <EffortSelect panelId={panelId} effort={chat.effort} />
```

- [ ] **Step 7: `/effort` no painel**

`AgentPanel.tsx`: adicionar estado de aviso do painel (reaproveitado pelas próximas tarefas) e o comando. Acima de `onLocalCommand`:

```ts
  const notify = (message: string) => useAgents.getState().apply(panelId, { kind: 'error', message })
```

Trocar `_arg` por `arg` e acrescentar o ramo:

```ts
    else if (name === 'effort') {
      if (!arg) document.getElementById(`effort-select-${panelId}`)?.focus()
      else if (arg === 'auto' || isEffortLevel(arg))
        void window.api.invoke('agent:setEffort', panelId, arg === 'auto' ? null : arg).catch((err) => notify(errorText(err)))
      else notify(`Esforço inválido: ${arg}. Use low, medium, high, xhigh, max ou auto.`)
    }
```

(importar `isEffortLevel` de `@shared/models`).

- [ ] **Step 8: E2E**

Create `e2e/agent-effort.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('seletor de esforço e /effort persistem no layout', async () => {
  const { app, page, userData } = await openAgent()
  const select = page.getByRole('combobox', { name: 'Esforço' })
  await expect(select).toHaveValue('')
  await select.selectOption('high')
  await expect(select).toHaveValue('high')

  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/effort max')
  await input.press('Enter')
  await expect(select).toHaveValue('max')

  await input.fill('/effort turbo')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Esforço inválido: turbo')

  await expect
    .poll(() => {
      try {
        return readFileSync(join(userData, 'layout.json'), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain('"effort":"max"')
  await app.close()
})
```

- [ ] **Step 9: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-effort.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A src test e2e/agent-effort.spec.ts
git commit -m "feat: effort level selector and /effort, applied live and persisted per panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `/context`

**Files:**
- Modify: `src/shared/agent.ts` (`ContextUsage`, `Outcome`)
- Modify: `src/shared/ipc-contract.ts` (`agent:contextUsage`)
- Modify: `src/main/agent/AgentSession.ts` (`getContextUsage`, `contextUsage()`)
- Modify: `src/main/agent/normalize.ts` (`parseContextUsage`)
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/agent/fakeQuery.ts`
- Create: `src/renderer/src/panels/agent/ContextModal.tsx`
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/main/AgentSession.test.ts`, `test/main/normalize.test.ts`, `e2e/agent-context.spec.ts`

**Interfaces:**
- Consumes: `onLocalCommand(name, arg)` (Task 1).
- Produces:
  - `export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string }` em `@shared/agent`
  - `export type ContextUsage = { model: string; totalTokens: number; maxTokens: number; percentage: number; categories: Array<{ name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' | 'deferred' }>; memoryFiles: Array<{ path: string; tokens: number }> }`
  - `parseContextUsage(raw: unknown): ContextUsage | null` em `normalize.ts`
  - `AgentSession.contextUsage(): Promise<Outcome<ContextUsage>>`
  - IPC `'agent:contextUsage': { args: [panelId: string]; result: Outcome<ContextUsage> }`
  - `unsupported(feature: string): { ok: false; message: string }` exportado de `AgentSession.ts` (reusado nas Tasks 4)

- [ ] **Step 1: Write the failing tests**

`test/main/normalize.test.ts`:

```ts
describe('parseContextUsage', () => {
  it('keeps the fields the modal shows and drops malformed entries', () => {
    expect(
      parseContextUsage({
        model: 'opus',
        totalTokens: 18000,
        maxTokens: 200000,
        percentage: 9,
        categories: [
          { name: 'Messages', tokens: 1000, color: 'blue', kind: 'used' },
          { name: 'bad', tokens: 'x' },
        ],
        memoryFiles: [{ path: '/p/CLAUDE.md', type: 'Project', tokens: 300 }],
        gridRows: [],
      }),
    ).toEqual({
      model: 'opus',
      totalTokens: 18000,
      maxTokens: 200000,
      percentage: 9,
      categories: [{ name: 'Messages', tokens: 1000, color: 'blue', kind: 'used' }],
      memoryFiles: [{ path: '/p/CLAUDE.md', tokens: 300 }],
    })
    expect(parseContextUsage(null)).toBeNull()
    expect(parseContextUsage({ totalTokens: 'x' })).toBeNull()
  })
})
```

(adicionar `parseContextUsage` ao import do topo.)

`test/main/AgentSession.test.ts` dentro do `describe('AgentSession')`:

```ts
  it('reports context usage, starting the query if needed', async () => {
    const f = fake()
    f.q.getContextUsage = async () => ({ model: 'opus', totalTokens: 10, maxTokens: 100, percentage: 10, categories: [], memoryFiles: [] })
    const { s } = session(f.fn)
    await expect(s.contextUsage()).resolves.toEqual({
      ok: true,
      value: { model: 'opus', totalTokens: 10, maxTokens: 100, percentage: 10, categories: [], memoryFiles: [] },
    })
    expect(f.calls).toHaveLength(1)
  })

  it('context usage degrades when unsupported or failing', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await expect(s.contextUsage()).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
    f.q.getContextUsage = async () => {
      throw new Error('boom')
    }
    await expect(s.contextUsage()).resolves.toEqual({ ok: false, message: 'boom' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/normalize.test.ts test/main/AgentSession.test.ts`
Expected: FAIL (`parseContextUsage`/`contextUsage` não existem).

- [ ] **Step 3: Implementation**

`src/shared/agent.ts` (perto de `SideAnswer`):

```ts
/** Result of a panel operation that can be unsupported by the installed Claude Code or fail. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string }

/** Same data as the CLI's /context. */
export type ContextUsage = {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  categories: Array<{ name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' | 'deferred' }>
  memoryFiles: Array<{ path: string; tokens: number }>
}
```

`src/main/agent/normalize.ts` (exportar; usa `isRec`/`str` já existentes no arquivo — se `num` não existir, definir localmente):

```ts
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const CATEGORY_KINDS = new Set(['used', 'free', 'buffer', 'deferred'])

/** Validates the SDK's getContextUsage() response down to what the /context modal shows. */
export function parseContextUsage(raw: unknown): ContextUsage | null {
  if (!isRec(raw) || !finite(raw.totalTokens) || !finite(raw.maxTokens)) return null
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
```

(importar `ContextUsage` de `@shared/agent`.)

`src/main/agent/AgentSession.ts`:
- `QueryLike` ganha `getContextUsage?(): Promise<unknown>`;
- importar `ContextUsage`, `Outcome` e `parseContextUsage`;
- exportar helper no topo (após `isMainLoopActivity`):

```ts
export const unsupported = (feature: string): { ok: false; message: string } => ({
  ok: false,
  message: `${feature} não é suportado por esta versão do Claude Code.`,
})
const failure = (err: unknown): { ok: false; message: string } => ({ ok: false, message: err instanceof Error ? err.message : String(err) })
```

- método após `usage()`:

```ts
  /** The CLI's /context. Starts the query so a fresh panel shows its baseline cost. */
  async contextUsage(): Promise<Outcome<ContextUsage>> {
    this.start()
    const query = this.query
    if (!query?.getContextUsage) return unsupported('/context')
    try {
      const usage = parseContextUsage(await query.getContextUsage())
      return usage ? { ok: true, value: usage } : { ok: false, message: 'Resposta inesperada do Claude Code.' }
    } catch (err) {
      return failure(err)
    }
  }
```

- em `btw()`, trocar a mensagem literal de não suportado por `return unsupported('/btw')` (mesmo texto de antes).

`src/shared/ipc-contract.ts`: importar `ContextUsage, Outcome`; em `InvokeMap` após `'agent:btwCancel'`:

```ts
  'agent:contextUsage': { args: [panelId: string]; result: Outcome<ContextUsage> }
```

e `'agent:contextUsage',` em `INVOKE_CHANNELS`.

`src/main/ipc/handlers.ts`:

```ts
    'agent:contextUsage': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).contextUsage()
    },
```

`src/main/agent/fakeQuery.ts` no `Object.assign`:

```ts
    getContextUsage: async () => ({
      model,
      totalTokens: 18000,
      maxTokens: 200000,
      percentage: 9,
      categories: [
        { name: 'System tools', tokens: 12000, color: 'gray', kind: 'used' },
        { name: 'Messages', tokens: 6000, color: 'purple', kind: 'used' },
        { name: 'Free space', tokens: 182000, color: 'gray', kind: 'free' },
      ],
      memoryFiles: [{ path: `${options.cwd}/CLAUDE.md`, type: 'Project', tokens: 300 }],
    }),
```

- [ ] **Step 4: ContextModal**

Create `src/renderer/src/panels/agent/ContextModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ContextUsage } from '@shared/agent'

const fmt = (n: number) => n.toLocaleString('pt-BR')
// SDK colors are theme names from the CLI; map the common ones, fall back to a neutral tone.
const COLOR: Record<string, string> = {
  gray: '#737373', grey: '#737373', purple: '#a78bfa', blue: '#60a5fa', green: '#4ade80', yellow: '#facc15',
  orange: '#fb923c', red: '#f87171', cyan: '#22d3ee', magenta: '#e879f9', pink: '#f472b6',
}
const colorOf = (c: string) => COLOR[c.toLowerCase().replace(/[^a-z]/g, '')] ?? (c.startsWith('#') ? c : '#a3a3a3')

export function ContextModal({ panelId, onClose }: { panelId: string; onClose(): void }) {
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.api
      .invoke('agent:contextUsage', panelId)
      .then((r) => (r.ok ? setUsage(r.value) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [panelId])
  const used = usage?.categories.filter((c) => c.kind !== 'free') ?? []
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Uso do contexto" className="w-[min(560px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Uso do contexto</div>
        {error && <div className="text-amber-300">{error}</div>}
        {!usage && !error && <div className="text-neutral-500">Carregando…</div>}
        {usage && (
          <>
            <div data-testid="context-total" className="mb-2 text-neutral-300">
              {fmt(usage.totalTokens)} / {fmt(usage.maxTokens)} tokens ({Math.round(usage.percentage)}%) · {usage.model}
            </div>
            <div className="mb-3 flex h-3 overflow-hidden rounded bg-neutral-800">
              {used.map((c) => (
                <div key={c.name} title={`${c.name}: ${fmt(c.tokens)}`} style={{ width: `${(c.tokens / usage.maxTokens) * 100}%`, background: colorOf(c.color) }} />
              ))}
            </div>
            <ul className="mb-3 space-y-0.5">
              {usage.categories.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(c.color) }} />
                  <span className="flex-1 text-neutral-300">{c.name}</span>
                  <span className="text-neutral-500">{fmt(c.tokens)}</span>
                </li>
              ))}
            </ul>
            {usage.memoryFiles.length > 0 && (
              <>
                <div className="mb-1 text-xs font-medium text-neutral-400">Arquivos de memória</div>
                <ul className="space-y-0.5">
                  {usage.memoryFiles.map((m) => (
                    <li key={m.path} className="flex gap-2 text-xs">
                      <span className="flex-1 truncate text-neutral-300">{m.path}</span>
                      <span className="text-neutral-500">{fmt(m.tokens)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

`AgentPanel.tsx`: `const [contextOpen, setContextOpen] = useState(false)`; em `onLocalCommand`: `else if (name === 'context') setContextOpen(true)`; no JSX junto do `ResumeModal`:

```tsx
      {contextOpen && <ContextModal panelId={panelId} onClose={() => setContextOpen(false)} />}
```

- [ ] **Step 5: E2E**

Create `e2e/agent-context.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/context mostra uso por categoria e arquivos de memória', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/context')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Uso do contexto' })
  await expect(dialog.getByTestId('context-total')).toContainText('18.000 / 200.000 tokens (9%)')
  await expect(dialog).toContainText('Messages')
  await expect(dialog).toContainText('CLAUDE.md')
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)
  await app.close()
})
```

- [ ] **Step 6: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-context.spec.ts e2e/agent-btw.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src test e2e/agent-context.spec.ts
git commit -m "feat: /context modal with per-category context usage and memory files

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Checkpoints de arquivo no main

**Files:**
- Modify: `src/main/agent/AgentSession.ts`
- Modify: `src/shared/agent.ts` (`RewindFilesResult`)
- Modify: `src/shared/ipc-contract.ts` (`agent:rewindFiles`)
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/agent/fakeQuery.ts`
- Test: `test/main/AgentSession.test.ts`, `test/main/fakeQuery.test.ts`

**Interfaces:**
- Consumes: `Outcome`, `unsupported`, `failure` (Task 3).
- Produces:
  - `UserMessageLike` ganha `uuid?: string`; `send()` envia `uuid` = id do evento `user`
  - `QueryOptions.enableFileCheckpointing: true` sempre
  - `export type RewindFiles = { canRewind: boolean; error?: string; filesChanged: string[]; insertions: number; deletions: number }` em `@shared/agent`
  - `AgentSession.rewindFiles(userMessageId: string, dryRun: boolean): Promise<Outcome<RewindFiles>>`
  - IPC `'agent:rewindFiles': { args: [panelId: string, userMessageId: string, dryRun: boolean]; result: Outcome<RewindFiles> }`

- [ ] **Step 1: Write the failing tests**

`test/main/AgentSession.test.ts`:

```ts
  it('tags each sent message with the user event id and enables file checkpointing', async () => {
    const f = fake()
    const { s, events } = session(f.fn)
    s.send('oi')
    await tick()
    expect(f.calls[0]!.options.enableFileCheckpointing).toBe(true)
    const user = events.find((e) => e.kind === 'user') as Extract<AgentEvent, { kind: 'user' }>
    expect(f.received[0]!.uuid).toBe(user.id)
  })

  it('rewinds files (dry run and real), normalizing the SDK result', async () => {
    const f = fake()
    const rewind = vi.fn(async (_id: string, opts?: { dryRun?: boolean }) =>
      opts?.dryRun ? { canRewind: true, filesChanged: ['/p/a.ts'], insertions: 2, deletions: 1 } : { canRewind: true, skippedLinks: 0 },
    )
    f.q.rewindFiles = rewind
    const { s } = session(f.fn)
    await expect(s.rewindFiles('u1', true)).resolves.toEqual({
      ok: true,
      value: { canRewind: true, filesChanged: ['/p/a.ts'], insertions: 2, deletions: 1 },
    })
    expect(rewind).toHaveBeenCalledWith('u1', { dryRun: true })
    await expect(s.rewindFiles('u1', false)).resolves.toEqual({ ok: true, value: { canRewind: true, filesChanged: [], insertions: 0, deletions: 0 } })
  })

  it('surfaces canRewind false with the SDK error, and unsupported binaries', async () => {
    const f = fake()
    const { s } = session(f.fn)
    await expect(s.rewindFiles('u1', true)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
    f.q.rewindFiles = async () => ({ canRewind: false, error: 'Sem checkpoint' })
    await expect(s.rewindFiles('u1', true)).resolves.toEqual({
      ok: true,
      value: { canRewind: false, error: 'Sem checkpoint', filesChanged: [], insertions: 0, deletions: 0 },
    })
  })
```

`test/main/fakeQuery.test.ts` — novo `it` no describe existente (siga o padrão do arquivo para criar a query com `fakeQuery({ prompt, options })`; se o arquivo tiver um helper, use-o):

```ts
  it('supports rewindFiles for e2e', async () => {
    const q = fakeQuery({ prompt: new AsyncQueue(), options: { cwd: '/p', permissionMode: 'default', includePartialMessages: true, canUseTool: async () => ({ behavior: 'allow' }), settingSources: [], abortController: new AbortController(), enableFileCheckpointing: true } })
    await expect(q.rewindFiles!('x', { dryRun: true })).resolves.toMatchObject({ canRewind: true, filesChanged: ['/p/src/app.ts'] })
    q.close()
  })
```

(importar `AsyncQueue` de `../../src/main/agent/AsyncQueue` se ainda não estiver.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/AgentSession.test.ts test/main/fakeQuery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`src/shared/agent.ts`:

```ts
/** Preview (dryRun) or result of restoring files to their state before a user message. */
export type RewindFiles = { canRewind: boolean; error?: string; filesChanged: string[]; insertions: number; deletions: number }
```

`src/main/agent/AgentSession.ts`:
- `UserMessageLike` = `{ type: 'user'; uuid?: string; message: ...; parent_tool_use_id: null }`;
- `QueryOptions` ganha `enableFileCheckpointing: true`;
- `QueryLike` ganha `rewindFiles?(userMessageId: string, options?: { dryRun?: boolean }): Promise<unknown>`;
- em `start()`, nas opções fixas: `enableFileCheckpointing: true,`;
- em `send()`, gerar o id uma vez e usá-lo nos dois lugares:

```ts
    const id = this.newId()
    this.emit({ kind: 'user', id, text, images: images.length })
    this.turnsInFlight++
    this.setState('running')
    // Same id as the chat's user item: the CLI keeps it in the transcript and checkpoints by it (/rewind).
    this.input?.push({ type: 'user', uuid: id, message: { role: 'user', content }, parent_tool_use_id: null })
```

- método novo após `contextUsage()`:

```ts
  /** The CLI's /rewind for files: `dryRun` previews what restoring to before `userMessageId` changes. */
  async rewindFiles(userMessageId: string, dryRun: boolean): Promise<Outcome<RewindFiles>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.rewindFiles) return unsupported('/rewind')
    try {
      const r = (await query.rewindFiles(userMessageId, { dryRun })) as Record<string, unknown> | null
      const files = Array.isArray(r?.filesChanged) ? r.filesChanged.filter((f): f is string => typeof f === 'string') : []
      return {
        ok: true,
        value: {
          canRewind: r?.canRewind === true,
          ...(typeof r?.error === 'string' ? { error: r.error } : {}),
          filesChanged: files,
          insertions: typeof r?.insertions === 'number' ? r.insertions : 0,
          deletions: typeof r?.deletions === 'number' ? r.deletions : 0,
        },
      }
    } catch (err) {
      return failure(err)
    }
  }
```

(importar `RewindFiles` de `@shared/agent`.)

`src/shared/ipc-contract.ts` (importar `RewindFiles`):

```ts
  'agent:rewindFiles': { args: [panelId: string, userMessageId: string, dryRun: boolean]; result: Outcome<RewindFiles> }
```

+ `'agent:rewindFiles',` em `INVOKE_CHANNELS`.

`src/main/ipc/handlers.ts`:

```ts
    'agent:rewindFiles': async (panelId, userMessageId, dryRun) => {
      await d.agentReady()
      return d.agents.get(panelId).rewindFiles(userMessageId, dryRun)
    },
```

`src/main/agent/fakeQuery.ts` no `Object.assign`:

```ts
    rewindFiles: async (_id: string, opts?: { dryRun?: boolean }) =>
      opts?.dryRun ? { canRewind: true, filesChanged: [`${options.cwd}/src/app.ts`], insertions: 3, deletions: 1 } : { canRewind: true, skippedLinks: 0 },
```

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (incluindo o teste de `starts lazily...` que verifica `f.received` — ele compara só `message.content`, então o `uuid` novo não quebra).

- [ ] **Step 5: Commit**

```bash
git add -A src test
git commit -m "feat: file checkpoints keyed by the chat's user message id, with rewindFiles IPC

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Voltar a conversa (fork até antes de uma mensagem) e renomear no main

**Files:**
- Create: `src/main/agent/rewind.ts`
- Modify: `src/main/agent/sdk.ts` (`fork`, `rename` no `SessionStoreApi`)
- Modify: `src/main/agent/fakeQuery.ts` (`fakeSessions` com 2 turnos + `fork` + `rename`)
- Modify: `src/main/index.ts` (repasse de `fork`/`rename` em `sessions`)
- Modify: `src/shared/ipc-contract.ts` (`agent:forkBefore`, `agent:rename`)
- Modify: `src/main/ipc/handlers.ts`
- Test: `test/main/rewind.test.ts`, `test/main/handlers.test.ts`, `test/main/fakeQuery.test.ts`

**Interfaces:**
- Consumes: `Outcome` (Task 3), `historyToEvents` (existente).
- Produces:
  - `forkPointBefore(history: unknown[], userMessageId: string): string | null` — uuid da última entrada **anterior** à mensagem; `null` se a mensagem é a primeira entrada com uuid; lança `Error('Mensagem não encontrada no histórico da sessão.')` se não achar
  - `SessionStoreApi.fork(dir: string, sessionId: string, upToMessageId: string): Promise<string>` (novo sessionId)
  - `SessionStoreApi.rename(dir: string, sessionId: string, title: string): Promise<void>`
  - IPC `'agent:forkBefore': { args: [projectPath: string, sessionId: string, userMessageId: string]; result: Outcome<{ sessionId: string | null; history: AgentEvent[] }> }` — `sessionId: null` + `history: []` = voltar para o início
  - IPC `'agent:rename': { args: [projectPath: string, sessionId: string, title: string]; result: Outcome<null> }`

- [ ] **Step 1: Write the failing tests**

Create `test/main/rewind.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { forkPointBefore } from '../../src/main/agent/rewind'

const H = [
  { type: 'user', uuid: 'u1' },
  { type: 'assistant', uuid: 'a1' },
  { type: 'system', subtype: 'x' },
  { type: 'user', uuid: 'u2' },
  { type: 'assistant', uuid: 'a2' },
]

describe('forkPointBefore', () => {
  it('returns the last entry with a uuid before the message', () => {
    expect(forkPointBefore(H, 'u2')).toBe('a1')
  })
  it('returns null for the first message (rewind to an empty conversation)', () => {
    expect(forkPointBefore(H, 'u1')).toBeNull()
  })
  it('throws when the message is not in the transcript', () => {
    expect(() => forkPointBefore(H, 'nope')).toThrow('Mensagem não encontrada no histórico da sessão.')
  })
})
```

`test/main/fakeQuery.test.ts` — atualizar a asserção existente de tamanho do histórico de `toHaveLength(2)` para `toHaveLength(4)`, e adicionar:

```ts
  it('forks and renames sessions for e2e', async () => {
    await expect(fakeSessions.fork('/p', 'fake-old', 'h2')).resolves.toBe('fake-fork')
    await expect(fakeSessions.rename('/p', 'fake-old', 'x')).resolves.toBeUndefined()
  })
```

`test/main/handlers.test.ts` — atualizar a asserção de `agent:history` para `['user', 'text', 'user', 'text']` e adicionar:

```ts
  it('agent:forkBefore forks up to the entry before the message and returns its history', async () => {
    const fork = vi.fn(async () => 'fake-fork')
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    const r = await h['agent:forkBefore']('/proj', 'fake-old', 'h3')
    expect(fork).toHaveBeenCalledWith('/proj', 'fake-old', 'h2')
    expect(r).toEqual({ ok: true, value: { sessionId: 'fake-fork', history: [{ kind: 'user', id: 'h1', text: 'pergunta antiga', images: 0 }, { kind: 'text', key: 'hm1:0', text: 'resposta antiga' }] } })
  })

  it('agent:forkBefore on the first message returns an empty conversation without forking', async () => {
    const fork = vi.fn()
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    await expect(h['agent:forkBefore']('/proj', 'fake-old', 'h1')).resolves.toEqual({ ok: true, value: { sessionId: null, history: [] } })
    expect(fork).not.toHaveBeenCalled()
  })

  it('agent:forkBefore and agent:rename report failures instead of throwing', async () => {
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, rename: async () => { throw new Error('ro') } } }))
    await expect(h['agent:forkBefore']('/proj', 'fake-old', 'zz')).resolves.toEqual({ ok: false, message: 'Mensagem não encontrada no histórico da sessão.' })
    await expect(h['agent:rename']('/proj', 'fake-old', 'T')).resolves.toEqual({ ok: false, message: 'ro' })
    await expect(buildHandlers(deps())['agent:rename']('/proj', 'fake-old', 'T')).resolves.toEqual({ ok: true, value: null })
  })
```

Nota: a chave do evento `text` do histórico vem do `StreamNormalizer`. Antes de fixar `'hm1:0'`, rode o teste de `agent:history` existente com `console.log(events)` ou leia `normalize.ts` para confirmar o formato da `key`; use o valor real.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/rewind.test.ts test/main/handlers.test.ts test/main/fakeQuery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

Create `src/main/agent/rewind.ts`:

```ts
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
```

`src/main/agent/sdk.ts`:

```ts
export type SessionStoreApi = {
  list(dir: string): Promise<SessionSummary[]>
  history(dir: string, sessionId: string): Promise<unknown[]>
  fork(dir: string, sessionId: string, upToMessageId: string): Promise<string>
  rename(dir: string, sessionId: string, title: string): Promise<void>
}
```

e no objeto retornado por `loadSdk`:

```ts
    fork: async (dir, sessionId, upToMessageId) => (await sdk.forkSession(sessionId, { dir, upToMessageId })).sessionId,
    rename: (dir, sessionId, title) => sdk.renameSession(sessionId, title, { dir }),
```

`src/main/agent/fakeQuery.ts` — `fakeSessions`:

```ts
const FAKE_HISTORY = [
  { type: 'user', uuid: 'h1', parent_tool_use_id: null, message: { role: 'user', content: 'pergunta antiga' } },
  { type: 'assistant', uuid: 'h2', parent_tool_use_id: null, message: { id: 'hm1', content: [{ type: 'text', text: 'resposta antiga' }] } },
  { type: 'user', uuid: 'h3', parent_tool_use_id: null, message: { role: 'user', content: 'segunda pergunta' } },
  { type: 'assistant', uuid: 'h4', parent_tool_use_id: null, message: { id: 'hm2', content: [{ type: 'text', text: 'segunda resposta' }] } },
]

export const fakeSessions: SessionStoreApi = {
  list: async () => [{ sessionId: 'fake-old', title: 'Sessão antiga de teste', lastModified: Date.now() - 60_000 }],
  // The fork (always cut before "segunda pergunta" in the e2e) keeps only the first turn.
  history: async (_dir, sessionId) => (sessionId === 'fake-fork' ? FAKE_HISTORY.slice(0, 2) : FAKE_HISTORY),
  fork: async () => 'fake-fork',
  rename: async () => undefined,
}
```

`src/main/index.ts` linha ~131 (objeto `sessions`), completar o repasse:

```ts
    sessions: {
      list: (dir) => requireSdk().list(dir),
      history: (dir, id) => requireSdk().history(dir, id),
      fork: (dir, id, upTo) => requireSdk().fork(dir, id, upTo),
      rename: (dir, id, title) => requireSdk().rename(dir, id, title),
    },
```

`src/shared/ipc-contract.ts`:

```ts
  'agent:forkBefore': { args: [projectPath: string, sessionId: string, userMessageId: string]; result: Outcome<{ sessionId: string | null; history: AgentEvent[] }> }
  'agent:rename': { args: [projectPath: string, sessionId: string, title: string]; result: Outcome<null> }
```

+ ambos em `INVOKE_CHANNELS`.

`src/main/ipc/handlers.ts` (importar `forkPointBefore` de `../agent/rewind`; helper local `const failed = (err: unknown) => ({ ok: false as const, message: err instanceof Error ? err.message : String(err) })`):

```ts
    'agent:forkBefore': async (projectPath, sessionId, userMessageId) => {
      await d.agentReady()
      try {
        const point = forkPointBefore(await d.sessions.history(projectPath, sessionId), userMessageId)
        if (point === null) return { ok: true as const, value: { sessionId: null, history: [] } }
        const forked = await d.sessions.fork(projectPath, sessionId, point)
        return { ok: true as const, value: { sessionId: forked, history: historyToEvents(await d.sessions.history(projectPath, forked)) } }
      } catch (err) {
        return failed(err)
      }
    },
    'agent:rename': async (projectPath, sessionId, title) => {
      await d.agentReady()
      try {
        await d.sessions.rename(projectPath, sessionId, title)
        return { ok: true as const, value: null }
      } catch (err) {
        return failed(err)
      }
    },
```

Nota: o `history` do fork no teste vem do próprio `fakeSessions` (`'fake-fork'` → só o primeiro turno), por isso o valor esperado tem 2 eventos.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. Se `e2e/agent-slash.spec.ts`/`agent-restore.spec.ts` dependem do conteúdo do histórico falso, eles só usam `toContainText` — a entrada extra não quebra.

- [ ] **Step 5: Commit**

```bash
git add -A src test
git commit -m "feat: fork a session up to before a message, and rename sessions (main side)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `/rewind` na UI (modal, 3 modos, Esc Esc)

**Files:**
- Create: `src/renderer/src/agent/rewind.ts` (lógica pura do fluxo)
- Create: `src/renderer/src/panels/agent/RewindModal.tsx`
- Modify: `src/renderer/src/agent/composerKeys.ts` (`isDoubleEscape`)
- Modify: `src/renderer/src/panels/agent/Composer.tsx` (Esc Esc)
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/renderer/rewind.test.ts`, `test/renderer/composerKeys.test.ts`, `e2e/agent-rewind.spec.ts`

**Interfaces:**
- Consumes: IPC `agent:rewindFiles` (Task 4), `agent:forkBefore` (Task 5), `restart()` e `base()` do `AgentPanel`, `useAgents.getState().setDraft`.
- Produces:
  - `export type RewindMode = 'both' | 'conversation' | 'code'`
  - `rewindTargets(items: ChatItem[]): Array<{ id: string; text: string }>` — mensagens do usuário com id, da mais recente para a mais antiga
  - `runRewind(mode, target, deps): Promise<void>` com `deps = { rewindFiles(id): Promise<Outcome<RewindFiles>>; forkBefore(id): Promise<Outcome<{ sessionId: string | null; history: AgentEvent[] }>>; restart(sessionId: string | null, history: AgentEvent[]): Promise<void>; setDraft(text: string): void }`; lança `Error` com a mensagem do SDK em falha
  - `isDoubleEscape(previous: number | null, now: number, windowMs = 500): boolean`

- [ ] **Step 1: Write the failing tests**

Create `test/renderer/rewind.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { rewindTargets, runRewind } from '@renderer/agent/rewind'
import type { ChatItem } from '@renderer/agent/chatReducer'

const items: ChatItem[] = [
  { type: 'user', id: 'u1', text: 'primeira', images: 0 },
  { type: 'text', key: 'k', text: 'resp', final: true },
  { type: 'user', id: '', text: 'sem id', images: 0 },
  { type: 'user', id: 'u2', text: 'segunda', images: 0 },
]

const ok = <T,>(value: T) => ({ ok: true as const, value })

function deps() {
  return {
    rewindFiles: vi.fn(async () => ok({ canRewind: true, filesChanged: [], insertions: 0, deletions: 0 })),
    forkBefore: vi.fn(async () => ok({ sessionId: 'f1', history: [] })),
    restart: vi.fn(async () => undefined),
    setDraft: vi.fn(),
  }
}

describe('rewindTargets', () => {
  it('lists user messages with an id, newest first', () => {
    expect(rewindTargets(items)).toEqual([{ id: 'u2', text: 'segunda' }, { id: 'u1', text: 'primeira' }])
  })
})

describe('runRewind', () => {
  const target = { id: 'u2', text: 'segunda' }
  it('both: restores files first, then forks the conversation and puts the prompt back', async () => {
    const d = deps()
    await runRewind('both', target, d)
    expect(d.rewindFiles).toHaveBeenCalledWith('u2')
    expect(d.forkBefore).toHaveBeenCalledWith('u2')
    expect(d.rewindFiles.mock.invocationCallOrder[0]).toBeLessThan(d.forkBefore.mock.invocationCallOrder[0]!)
    expect(d.restart).toHaveBeenCalledWith('f1', [])
    expect(d.setDraft).toHaveBeenCalledWith('segunda')
  })
  it('conversation: leaves files alone', async () => {
    const d = deps()
    await runRewind('conversation', target, d)
    expect(d.rewindFiles).not.toHaveBeenCalled()
    expect(d.restart).toHaveBeenCalled()
  })
  it('code: leaves the conversation alone', async () => {
    const d = deps()
    await runRewind('code', target, d)
    expect(d.forkBefore).not.toHaveBeenCalled()
    expect(d.restart).not.toHaveBeenCalled()
    expect(d.setDraft).not.toHaveBeenCalled()
  })
  it('stops with the SDK message when restoring files is refused', async () => {
    const d = deps()
    d.rewindFiles.mockResolvedValueOnce(ok({ canRewind: false, error: 'Sem checkpoint', filesChanged: [], insertions: 0, deletions: 0 }))
    await expect(runRewind('both', target, d)).rejects.toThrow('Sem checkpoint')
    expect(d.forkBefore).not.toHaveBeenCalled()
  })
  it('propagates fork failures', async () => {
    const d = deps()
    d.forkBefore.mockResolvedValueOnce({ ok: false, message: 'falhou' })
    await expect(runRewind('conversation', target, d)).rejects.toThrow('falhou')
  })
})
```

`test/renderer/composerKeys.test.ts`:

```ts
describe('isDoubleEscape', () => {
  it('is true only for a second Esc within the window', () => {
    expect(isDoubleEscape(null, 1000)).toBe(false)
    expect(isDoubleEscape(1000, 1400)).toBe(true)
    expect(isDoubleEscape(1000, 1600)).toBe(false)
  })
})
```

(adicionar `isDoubleEscape` ao import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/renderer/rewind.test.ts test/renderer/composerKeys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Pure logic**

Create `src/renderer/src/agent/rewind.ts`:

```ts
import type { AgentEvent, Outcome, RewindFiles } from '@shared/agent'
import type { ChatItem } from './chatReducer'

export type RewindMode = 'both' | 'conversation' | 'code'
export type RewindTarget = { id: string; text: string }
export type RewindDeps = {
  rewindFiles(id: string): Promise<Outcome<RewindFiles>>
  forkBefore(id: string): Promise<Outcome<{ sessionId: string | null; history: AgentEvent[] }>>
  restart(sessionId: string | null, history: AgentEvent[]): Promise<void>
  setDraft(text: string): void
}

export function rewindTargets(items: ChatItem[]): RewindTarget[] {
  const out: RewindTarget[] = []
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type === 'user' && it.id) out.push({ id: it.id, text: it.text })
  }
  return out
}

/** The CLI's /rewind: files first (needs the live session's checkpoints), then the conversation. */
export async function runRewind(mode: RewindMode, target: RewindTarget, deps: RewindDeps): Promise<void> {
  if (mode !== 'conversation') {
    const files = await deps.rewindFiles(target.id)
    if (!files.ok) throw new Error(files.message)
    if (!files.value.canRewind) throw new Error(files.value.error ?? 'Não há checkpoint de arquivos para esta mensagem.')
  }
  if (mode === 'code') return
  const forked = await deps.forkBefore(target.id)
  if (!forked.ok) throw new Error(forked.message)
  await deps.restart(forked.value.sessionId, forked.value.history)
  deps.setDraft(target.text)
}
```

`src/renderer/src/agent/composerKeys.ts`:

```ts
/** Esc Esc (the CLI's shortcut for /rewind). */
export function isDoubleEscape(previous: number | null, now: number, windowMs = 500): boolean {
  return previous !== null && now - previous <= windowMs
}
```

- [ ] **Step 4: RewindModal**

Create `src/renderer/src/panels/agent/RewindModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { RewindFiles } from '@shared/agent'
import type { RewindMode, RewindTarget } from '../../agent/rewind'

type Props = { panelId: string; targets: RewindTarget[]; onRun(mode: RewindMode, target: RewindTarget): void; onClose(): void }

export function RewindModal({ panelId, targets, onRun, onClose }: Props) {
  const [picked, setPicked] = useState<RewindTarget | null>(null)
  const [preview, setPreview] = useState<RewindFiles | { message: string } | null>(null)
  useEffect(() => {
    if (!picked) return
    setPreview(null)
    let alive = true
    window.api
      .invoke('agent:rewindFiles', panelId, picked.id, true)
      .then((r) => alive && setPreview(r.ok ? r.value : { message: r.message }))
      .catch((err) => alive && setPreview({ message: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [panelId, picked])
  const files = preview && 'canRewind' in preview ? preview : null
  const codeBlocked = !files?.canRewind
  const codeReason = preview && 'message' in preview ? preview.message : files && !files.canRewind ? (files.error ?? 'Sem checkpoint de arquivos.') : null
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Voltar para uma mensagem" className="w-[min(560px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Voltar para uma mensagem</div>
        {targets.length === 0 && <div className="text-neutral-500">Nenhuma mensagem para voltar.</div>}
        {!picked && (
          <div className="max-h-80 space-y-1 overflow-auto">
            {targets.map((t) => (
              <button key={t.id} className="block w-full truncate rounded px-2 py-1 text-left text-neutral-200 hover:bg-neutral-800" onClick={() => setPicked(t)}>
                {t.text || '(imagem)'}
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="space-y-2">
            <div className="truncate rounded bg-neutral-800 px-2 py-1 text-neutral-200">{picked.text || '(imagem)'}</div>
            <div data-testid="rewind-preview" className="text-xs text-neutral-400">
              {!preview && 'Calculando mudanças…'}
              {files?.canRewind && `${files.filesChanged.length} arquivo(s) · +${files.insertions} −${files.deletions}`}
              {codeReason && <span className="text-amber-300">{codeReason}</span>}
            </div>
            {files?.canRewind && files.filesChanged.length > 0 && (
              <ul className="max-h-32 overflow-auto text-xs text-neutral-500">
                {files.filesChanged.map((f) => (
                  <li key={f} className="truncate">{f}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-orange-600 px-2 py-1 text-white hover:bg-orange-500 disabled:opacity-40" disabled={codeBlocked} onClick={() => onRun('both', picked)}>
                Código e conversa
              </button>
              <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700" onClick={() => onRun('conversation', picked)}>
                Só conversa
              </button>
              <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700 disabled:opacity-40" disabled={codeBlocked} onClick={() => onRun('code', picked)}>
                Só código
              </button>
              <span className="flex-1" />
              <button className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800" onClick={() => setPicked(null)}>
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire into AgentPanel + Esc Esc**

`AgentPanel.tsx`:

```ts
  const [rewindOpen, setRewindOpen] = useState(false)
  const busy = chat.state === 'running' || chat.state === 'awaiting_permission'

  const openRewind = () => {
    if (busy) notify('Pare o agente antes de voltar para uma mensagem anterior.')
    else setRewindOpen(true)
  }

  const runRewindMode = (mode: RewindMode, target: RewindTarget) => {
    setRewindOpen(false)
    const sessionId = chat.sessionId
    void runRewind(mode, target, {
      rewindFiles: (id) => window.api.invoke('agent:rewindFiles', panelId, id, false),
      forkBefore: (id) =>
        sessionId
          ? window.api.invoke('agent:forkBefore', params.projectPath, sessionId, id)
          : Promise.resolve({ ok: false as const, message: 'Sessão ainda não salva.' }),
      restart: (next, history) => restart({ ...base(), ...(next ? { sessionId: next } : {}) }, history),
      setDraft: (text) => useAgents.getState().setDraft(panelId, text),
    })
      .then(() => mode === 'code' && notify('Arquivos restaurados.'))
      .catch((err) => notify(`Não foi possível voltar: ${errorText(err)}`))
  }
```

Em `onLocalCommand`: `else if (name === 'rewind') openRewind()`. No JSX:

```tsx
      {rewindOpen && <RewindModal panelId={panelId} targets={rewindTargets(chat.items)} onRun={runRewindMode} onClose={() => setRewindOpen(false)} />}
```

(importar `RewindModal`, `rewindTargets`, `runRewind`, `RewindMode`, `RewindTarget`.)

Nota: `notify` usa o evento `error` para mostrar o aviso no chat (mesmo mecanismo já usado para falhas). "Arquivos restaurados." aparece como card de erro; aceitável nesta fase, sem novo tipo de card.

`Composer.tsx`: nova prop `onRewind(): void`; `const lastEsc = useRef<number | null>(null)`; no `onKeyDown`, logo após o bloco `if (e.key === 'Escape' && onEscape())`:

```ts
          if (e.key === 'Escape' && !busy && text === '') {
            const now = Date.now()
            if (isDoubleEscape(lastEsc.current, now)) {
              e.preventDefault()
              lastEsc.current = null
              onRewind()
              return
            }
            lastEsc.current = now
          }
```

(importar `isDoubleEscape`; em `AgentPanel` passar `onRewind={openRewind}`.)

- [ ] **Step 6: E2E**

Create `e2e/agent-rewind.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/rewind volta código e conversa para antes de uma mensagem', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  const chat = page.getByTestId('chat-view')

  // Sessão com histórico conhecido (fakeSessions): h1 "pergunta antiga", h3 "segunda pergunta".
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(chat).toContainText('segunda resposta')

  await input.fill('/rewind')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await dialog.getByRole('button', { name: 'segunda pergunta' }).click()
  await expect(dialog.getByTestId('rewind-preview')).toContainText('1 arquivo(s) · +3 −1')
  await dialog.getByRole('button', { name: 'Código e conversa' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(input).toHaveValue('segunda pergunta')
  await expect(chat).toContainText('resposta antiga')
  await app.close()
})

test('Esc Esc com o composer vazio abre o /rewind; voltar à primeira mensagem limpa o chat', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('segunda resposta')

  await input.press('Escape')
  await input.press('Escape')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await dialog.getByRole('button', { name: 'pergunta antiga' }).click()
  await dialog.getByRole('button', { name: 'Só conversa' }).click()
  await expect(input).toHaveValue('pergunta antiga')
  await expect(page.getByTestId('chat-view')).not.toContainText('resposta antiga')
  await app.close()
})
```

Nota: `fakeSessions.history('fake-fork')` devolve só o primeiro turno (Task 5), então depois do rewind o chat mostra só "pergunta antiga"/"resposta antiga". No primeiro teste, acrescentar também `await expect(chat).not.toContainText('segunda resposta')` depois do rewind.

- [ ] **Step 7: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-rewind.spec.ts e2e/agent-slash.spec.ts e2e/agent-btw.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src test e2e/agent-rewind.spec.ts
git commit -m "feat: /rewind modal (code and conversation, conversation only, code only) and Esc Esc

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `/rename`

**Files:**
- Modify: `src/shared/models.ts` (`AgentPanelParams.title`)
- Modify: `src/renderer/src/dock/panelOptions.ts` (`panelTitle` usa `title`)
- Modify: `src/renderer/src/stores/sessionsStore.ts` (`setTitle`)
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/renderer/panelOptions.test.ts`, `test/renderer/sessionsStore.test.ts`, `e2e/agent-rename.spec.ts`

**Interfaces:**
- Consumes: IPC `agent:rename` (Task 5), `notify` (Task 2).
- Produces:
  - `AgentPanelParams.title?: string`
  - `panelTitle({ type: 'agent', title })` → `` `${title} · claude` ``
  - `useSessions.getState().setTitle(panelId: string, title: string): void`

- [ ] **Step 1: Write the failing tests**

`test/renderer/panelOptions.test.ts` no `it('panelTitle per type')`:

```ts
    expect(panelTitle({ type: 'agent', projectPath: '/g/api', title: 'Refactor login' })).toBe('Refactor login · claude')
```

`test/renderer/sessionsStore.test.ts`:

```ts
  it('renames a session', () => {
    useSessions.getState().add({ panelId: 'r1', type: 'agent', projectPath: '/p', title: 'p · claude', state: 'idle' })
    useSessions.getState().setTitle('r1', 'Novo · claude')
    expect(useSessions.getState().byId.r1!.title).toBe('Novo · claude')
    useSessions.getState().setTitle('missing', 'x')
    expect(useSessions.getState().byId.missing).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/renderer/panelOptions.test.ts test/renderer/sessionsStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`src/shared/models.ts` — `AgentPanelParams` ganha `title?: string`.

`src/renderer/src/dock/panelOptions.ts`:

```ts
export function panelTitle(p: PanelParams): string {
  if (p.type === 'file') return basename(p.filePath)
  if (p.type === 'agent') return `${p.title ?? basename(p.projectPath)} · claude`
  return `${basename(p.projectPath)} · zsh`
}
```

`src/renderer/src/stores/sessionsStore.ts` — tipo e implementação:

```ts
  setTitle(panelId: string, title: string): void
```

```ts
  setTitle: (panelId, title) =>
    set((st) => {
      const current = st.byId[panelId]
      return current ? { byId: { ...st.byId, [panelId]: { ...current, title } } } : st
    }),
```

`AgentPanel.tsx` — `base()` preserva o título entre `/clear`/`/resume`/rewind? Não: título é da sessão. `base()` fica como está. Em `onLocalCommand`:

```ts
    else if (name === 'rename') renameSession(arg)
```

e a função:

```ts
  const renameSession = (title: string) => {
    const sessionId = chat.sessionId
    const hasTranscript = chat.items.some((it) => it.type === 'user')
    if (!title) return notify('Uso: /rename <título>')
    if (!sessionId || !hasTranscript) return notify('Envie uma mensagem antes de renomear a sessão.')
    void window.api
      .invoke('agent:rename', params.projectPath, sessionId, title)
      .then((r) => {
        if (!r.ok) return notify(r.message)
        const current = currentAgentParams(panelId)
        if (current) replacePanelParams(panelId, { ...current, title })
        const tabTitle = panelTitle({ ...(current ?? params), title })
        useDock.getState().api?.getPanel(panelId)?.api.setTitle(tabTitle)
        useSessions.getState().setTitle(panelId, tabTitle)
      })
      .catch((err) => notify(errorText(err)))
  }
```

(importar `panelTitle` de `../../dock/panelOptions` e `useDock` de `../../dock/dockStore`.)

Como `base()` monta params sem `title`, `/clear` e `/resume` naturalmente voltam ao título padrão — mas a aba não é re-titulada pelo `restartSession`. Em `restart`, depois de `restartSession(...)`, re-sincronizar:

```ts
  const restart = async (next: AgentPanelParams, history: AgentEvent[] = []) => {
    await restartSession(panelId, next, history, { /* deps existentes, sem mudança */ })
    const title = panelTitle(currentAgentParams(panelId) ?? next)
    useDock.getState().api?.getPanel(panelId)?.api.setTitle(title)
    useSessions.getState().setTitle(panelId, title)
  }
```

(manter exatamente o objeto de deps atual dentro da chamada.)

- [ ] **Step 4: E2E**

Create `e2e/agent-rename.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/rename renomeia a sessão e a aba; antes da primeira mensagem avisa', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/rename Cedo demais')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Envie uma mensagem antes de renomear a sessão.')

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')
  await input.fill('/rename Refactor do login')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'Refactor do login · claude' })).toBeVisible()

  await input.fill('/clear')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 5: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-rename.spec.ts e2e/agent-slash.spec.ts e2e/agent-restore.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src test e2e/agent-rename.spec.ts
git commit -m "feat: /rename renames the session and the panel tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verificação final (suíte + smoke real)

**Files:**
- Create (scratch, fora do repo): script de smoke no diretório de scratchpad da sessão

- [ ] **Step 1: Suíte completa**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test`
Expected: tudo verde. Se só `e2e/file-edit.spec.ts` falhar, rodar `npx playwright test e2e/file-edit.spec.ts` isolado; passando isolado, registrar como instabilidade pré-existente.

- [ ] **Step 2: Smoke real do SDK usado pelo main (haiku, pasta temporária)**

Script Node (ESM) que, com o `claude` real (`pathToClaudeCodeExecutable: $(which claude)`, `model: 'haiku'`, `settingSources: []`, `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `enableFileCheckpointing: true`), em uma pasta temporária com `a.txt = "original"`:
1. envia a mensagem 1 com `uuid` = U1 pedindo para escrever `um` em `a.txt`;
2. envia a mensagem 2 com `uuid` = U2 pedindo para escrever `dois` em `a.txt`;
3. `rewindFiles(U2, { dryRun: true })` → espera `canRewind: true`, `a.txt` listado;
4. `rewindFiles(U2)` → `a.txt` volta a `um`;
5. `getSessionMessages` + `forkPointBefore(history, U2)` (importando de `out/main` não é viável — copiar a função) + `forkSession(sid, { dir, upToMessageId })` → `getSessionMessages(novo)` não contém U2;
6. `renameSession(novo, 'smoke')` + `listSessions({ dir })` mostra o título;
7. `getContextUsage()` retorna `totalTokens > 0`; `applyFlagSettings({ effortLevel: 'low' })` resolve.

Expected: todos os passos imprimem OK.

- [ ] **Step 3: Smoke manual no app**

Run: `npm run dev`, abrir um projeto de teste, enviar uma mensagem que edite um arquivo, rodar `/context`, trocar o esforço, `/rename`, `/rewind` → "Código e conversa". Conferir arquivo restaurado e texto de volta no composer.

- [ ] **Step 4: Atualizar memória do projeto** — registrar em `next-ide-project.md` que o plano 4A foi concluído (data, branch, head) e que 4B/4C vêm a seguir.
