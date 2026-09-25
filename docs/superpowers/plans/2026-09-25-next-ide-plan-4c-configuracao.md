# Plano 4C — Configuração (/mcp, subagentes, /add-dir) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mcp` com status e controle dos servidores MCP, `/agents` + menção `@agent-` no composer, e `/add-dir` para dar acesso a pastas extras — tudo no painel do agente, como no CLI.

**Architecture:** Mesmo padrão dos planos 4A/4B: métodos opcionais no `QueryLike`, métodos no `AgentSession` devolvendo `Outcome<T>` (`unsupported()`/`failure()`), um canal IPC por operação, `fakeQuery` com respostas determinísticas, modais com `useDialogKeys` (Esc fecha, foco no diálogo). `/add-dir` guarda as pastas no `AgentSession` (opção `additionalDirectories` só vale no início da query), fecha a query atual sem perder `sessionId` e a próxima mensagem retoma com a lista nova; o painel persiste a lista em `AgentPanelParams.additionalDirectories`.

**Tech Stack:** Electron + React + zustand, `@anthropic-ai/claude-agent-sdk` 0.3.268 (`mcpServerStatus`, `toggleMcpServer`, `reconnectMcpServer`, `supportedAgents`, opção `additionalDirectories`), vitest, Playwright + `fakeQuery`.

**Spec:** `docs/superpowers/specs/2026-09-25-next-ide-paridade-cli-design.md` (seções 3, 6, 7, 8).

## Global Constraints

- Branch `fix/ajustes-visuais`. Commits terminando com exatamente `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- UI em pt-BR. Sem dependências novas.
- Convenções em vigor: `notify(message)` → `composer-notice`; erros dentro de modal aberto aparecem no modal; `useDialogKeys` (criado no 4A, `src/renderer/src/panels/agent/useDialogKeys.ts`) para foco/Esc de modais; `pending`/`setPending`/`pendingRef`, `liveChat()`, `liveSessionId()`, `isBusy()` no `AgentPanel`; `Outcome<T>`, `unsupported()`, `failure()` no `AgentSession.ts`.
- Criar/editar subagentes, hooks e servidores MCP pela UI está fora do escopo (continua no CLI).
- Comandos: `npm run typecheck`, `npx vitest run`, `npx electron-vite build && npx playwright test <spec>`. Instáveis conhecidos sob carga: `e2e/agent-restore`, `e2e/file-edit`, `e2e/quickopen` — rodar isolados se falharem.

## Review Focus

1. `/add-dir` enquanto o agente roda: recusado com aviso; com o agente parado, a próxima mensagem retoma **a mesma sessão** (mesmo `sessionId`) já com a pasta nova — Task 4.
2. `/add-dir` com caminho inexistente, relativo ou arquivo: aviso claro, nada muda — Task 4.
3. Fechar a query para aplicar pastas novas não pode fazer o `pump` antigo derrubar a query nova (corrida entre o fim do `for await` antigo e o `start()` seguinte) — Task 4.
4. Servidor MCP `needs-auth`: botão "Abrir em terminal" com `claude /mcp`; ligar/desligar/reconectar recarrega a lista e mostra erro do SDK no modal — Task 2.
5. `@agent-` sem query iniciada (painel novo): a lista de subagentes carrega (inicia a query) e o menu de arquivos continua funcionando para `@` normal — Task 3.

---

### Task 1: MCP e subagentes no main

**Files:**
- Modify: `src/shared/agent.ts` (`McpServer`, `AgentInfo`)
- Modify: `src/main/agent/AgentSession.ts`
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/agent/fakeQuery.ts`
- Test: `test/main/AgentSession.test.ts`, `test/main/fakeQuery.test.ts`

**Interfaces:**
- Produces:
  - `export type McpServer = { name: string; status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'; scope?: string; error?: string; version?: string }`
  - `export type AgentInfo = { name: string; description: string; model?: string }`
  - `QueryLike` opcionais: `mcpServerStatus?(): Promise<unknown[]>`, `toggleMcpServer?(name: string, enabled: boolean): Promise<void>`, `reconnectMcpServer?(name: string): Promise<void>`, `supportedAgents?(): Promise<unknown[]>`
  - `AgentSession.mcpServers(): Promise<Outcome<McpServer[]>>` (inicia a query), `toggleMcp(name, enabled): Promise<Outcome<null>>`, `reconnectMcp(name): Promise<Outcome<null>>`, `agents(): Promise<Outcome<AgentInfo[]>>` (inicia a query)
  - IPC: `'agent:mcpServers': { args: [panelId: string]; result: Outcome<McpServer[]> }`, `'agent:toggleMcp': { args: [panelId: string, name: string, enabled: boolean]; result: Outcome<null> }`, `'agent:reconnectMcp': { args: [panelId: string, name: string]; result: Outcome<null> }`, `'agent:agents': { args: [panelId: string]; result: Outcome<AgentInfo[]> }`

- [ ] **Step 1: Write the failing tests** — `test/main/AgentSession.test.ts`:

```ts
  describe('mcp and agents', () => {
    it('lists MCP servers (normalized) and agents, starting the query', async () => {
      const f = fake()
      f.q.mcpServerStatus = async () => [
        { name: 'github', status: 'connected', serverInfo: { name: 'gh', version: '1.2.0' }, scope: 'user' },
        { name: 'figma', status: 'needs-auth', error: 'login required' },
        { name: 'bad' },
      ]
      f.q.supportedAgents = async () => [{ name: 'Explore', description: 'Busca', model: 'haiku' }, { name: 'x' }]
      const { s } = session(f.fn)
      await expect(s.mcpServers()).resolves.toEqual({
        ok: true,
        value: [
          { name: 'github', status: 'connected', scope: 'user', version: '1.2.0' },
          { name: 'figma', status: 'needs-auth', error: 'login required' },
        ],
      })
      await expect(s.agents()).resolves.toEqual({ ok: true, value: [{ name: 'Explore', description: 'Busca', model: 'haiku' }, { name: 'x', description: '' }] })
      expect(f.calls).toHaveLength(1)
    })

    it('toggles and reconnects servers; reports unsupported, errors and closed sessions', async () => {
      const f = fake()
      const toggle = vi.fn(async () => undefined)
      f.q.toggleMcpServer = toggle
      f.q.reconnectMcpServer = async () => {
        throw new Error('timeout')
      }
      const { s } = session(f.fn)
      await expect(s.toggleMcp('github', false)).resolves.toEqual({ ok: true, value: null })
      expect(toggle).toHaveBeenCalledWith('github', false)
      await expect(s.reconnectMcp('github')).resolves.toEqual({ ok: false, message: 'timeout' })
      await expect(s.agents()).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
      s.close()
      await expect(s.mcpServers()).resolves.toEqual({ ok: false, message: 'Sessão encerrada.' })
    })
  })
```

`test/main/fakeQuery.test.ts` — novo `it` (padrão do arquivo): `await q.mcpServerStatus!()` contém `github` `connected` e `figma` `needs-auth`; depois de `await q.toggleMcpServer!('github', false)` o status de `github` é `disabled`; `await q.supportedAgents!()` contém `{ name: 'Explore' }` e `{ name: 'code-reviewer' }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/AgentSession.test.ts test/main/fakeQuery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`src/shared/agent.ts`: os dois tipos de Interfaces.

`src/main/agent/AgentSession.ts` — `QueryLike` ganha os 4 opcionais; funções de normalização no topo do arquivo (usam `isRec`):

```ts
const MCP_STATUSES = new Set(['connected', 'failed', 'needs-auth', 'pending', 'disabled'])

function toMcpServer(raw: unknown): McpServer | null {
  if (!isRec(raw) || typeof raw.name !== 'string' || typeof raw.status !== 'string' || !MCP_STATUSES.has(raw.status)) return null
  const version = isRec(raw.serverInfo) && typeof raw.serverInfo.version === 'string' ? raw.serverInfo.version : undefined
  return {
    name: raw.name,
    status: raw.status as McpServer['status'],
    ...(typeof raw.scope === 'string' ? { scope: raw.scope } : {}),
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
    ...(version ? { version } : {}),
  }
}

function toAgentInfo(raw: unknown): AgentInfo | null {
  if (!isRec(raw) || typeof raw.name !== 'string' || !raw.name) return null
  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
  }
}
```

Métodos (após `backgroundTasks`):

```ts
  /** The CLI's /mcp list. Starts the query so servers are connected and reported. */
  async mcpServers(): Promise<Outcome<McpServer[]>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.mcpServerStatus) return unsupported('/mcp')
    try {
      const list = await query.mcpServerStatus()
      return { ok: true, value: (Array.isArray(list) ? list : []).map(toMcpServer).filter((s): s is McpServer => s !== null) }
    } catch (err) {
      return failure(err)
    }
  }

  async toggleMcp(name: string, enabled: boolean): Promise<Outcome<null>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.toggleMcpServer) return unsupported('/mcp')
    try {
      await query.toggleMcpServer(name, enabled)
      return { ok: true, value: null }
    } catch (err) {
      return failure(err)
    }
  }

  async reconnectMcp(name: string): Promise<Outcome<null>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.reconnectMcpServer) return unsupported('/mcp')
    try {
      await query.reconnectMcpServer(name)
      return { ok: true, value: null }
    } catch (err) {
      return failure(err)
    }
  }

  /** Subagents available to this session (the CLI's /agents list). */
  async agents(): Promise<Outcome<AgentInfo[]>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    this.start()
    const query = this.query
    if (!query?.supportedAgents) return unsupported('/agents')
    try {
      const list = await query.supportedAgents()
      return { ok: true, value: (Array.isArray(list) ? list : []).map(toAgentInfo).filter((a): a is AgentInfo => a !== null) }
    } catch (err) {
      return failure(err)
    }
  }
```

IPC em `ipc-contract.ts` (+ `INVOKE_CHANNELS`) e `handlers.ts`:

```ts
    'agent:mcpServers': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).mcpServers()
    },
    'agent:toggleMcp': (panelId, name, enabled) => d.agents.get(panelId).toggleMcp(name, enabled),
    'agent:reconnectMcp': (panelId, name) => d.agents.get(panelId).reconnectMcp(name),
    'agent:agents': async (panelId) => {
      await d.agentReady()
      return d.agents.get(panelId).agents()
    },
```

`fakeQuery.ts` — estado por query + métodos no `Object.assign`:

```ts
  const mcp = new Map<string, { status: string; error?: string; scope: string }>([
    ['github', { status: 'connected', scope: 'user' }],
    ['figma', { status: 'needs-auth', error: 'Autenticação necessária', scope: 'project' }],
  ])
```

```ts
    mcpServerStatus: async () => [...mcp].map(([name, s]) => ({ name, status: s.status, scope: s.scope, ...(s.error ? { error: s.error } : {}), serverInfo: { name, version: '1.0.0' } })),
    toggleMcpServer: async (name: string, enabled: boolean) => {
      const s = mcp.get(name)
      if (!s) throw new Error(`Servidor desconhecido: ${name}`)
      mcp.set(name, { ...s, status: enabled ? 'connected' : 'disabled' })
    },
    reconnectMcpServer: async (name: string) => {
      const s = mcp.get(name)
      if (!s) throw new Error(`Servidor desconhecido: ${name}`)
      if (s.status === 'needs-auth') throw new Error('Faça login com claude /mcp')
      mcp.set(name, { ...s, status: 'connected' })
    },
    supportedAgents: async () => [
      { name: 'Explore', description: 'Busca no código' },
      { name: 'general-purpose', description: 'Tarefas gerais' },
      { name: 'code-reviewer', description: 'Revisa diffs', model: 'sonnet' },
    ],
```

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src test
git commit -m "feat: MCP server status/toggle/reconnect and subagent list in the agent session

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `/mcp` e `/agents` (modais)

**Files:**
- Modify: `src/renderer/src/agent/slash.ts` (`mcp`, `agents` locais; saem de `TUI_ONLY`)
- Create: `src/renderer/src/panels/agent/McpModal.tsx`
- Create: `src/renderer/src/panels/agent/AgentsModal.tsx`
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/renderer/slash.test.ts`, `e2e/agent-mcp.spec.ts`

**Interfaces:**
- Consumes: IPC da Task 1; `useDialogKeys`; `useDock.getState().open({ type: 'terminal', projectPath, initialCommand })` (já usado pelo aviso de comando TUI).
- Produces:
  - `LocalCommand` inclui `'mcp' | 'agents'`; `LOCAL_COMMANDS` ganha, depois de `fork`: `{ name: 'mcp', description: 'Servidores MCP: status, ligar/desligar, reconectar', argumentHint: '', local: true }` e `{ name: 'agents', description: 'Subagentes disponíveis', argumentHint: '', local: true }`
  - `TUI_ONLY` sem `mcp` e `agents`
  - `McpModal({ panelId, projectPath, onClose })` — `role="dialog"` `aria-label="Servidores MCP"`; linha por servidor com `data-testid="mcp-row"`, botões `Desligar <nome>` / `Ligar <nome>` / `Reconectar <nome>` e, para `needs-auth`, `Abrir em terminal` (abre `claude /mcp`)
  - `AgentsModal({ panelId, projectPath, onClose })` — `aria-label="Subagentes"`; lista nome, descrição, modelo; botão `Gerenciar no terminal` (abre `claude /agents`)

- [ ] **Step 1: Write the failing tests** — `test/renderer/slash.test.ts`: lista de `mergeCommands` ganha `'mcp', 'agents'` depois de `'fork'`; e:

```ts
    expect(classifySlash('/mcp')).toEqual({ kind: 'local', name: 'mcp', arg: '' })
    expect(classifySlash('/agents')).toEqual({ kind: 'local', name: 'agents', arg: '' })
```

(e remover qualquer asserção existente que espere `/mcp` ou `/agents` como `tui`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/renderer/slash.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementation**

`slash.ts`: conforme Interfaces.

Create `src/renderer/src/panels/agent/McpModal.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { McpServer } from '@shared/agent'
import { useDock } from '../../dock/dockStore'
import { useDialogKeys } from './useDialogKeys'

const LABEL: Record<McpServer['status'], string> = {
  connected: 'conectado',
  failed: 'falhou',
  'needs-auth': 'precisa de login',
  pending: 'conectando…',
  disabled: 'desligado',
}
const COLOR: Record<McpServer['status'], string> = {
  connected: 'text-emerald-400',
  failed: 'text-red-400',
  'needs-auth': 'text-amber-300',
  pending: 'text-neutral-400',
  disabled: 'text-neutral-500',
}

export function McpModal({ panelId, projectPath, onClose }: { panelId: string; projectPath: string; onClose(): void }) {
  const dialog = useDialogKeys(onClose)
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    window.api
      .invoke('agent:mcpServers', panelId)
      .then((r) => (r.ok ? (setServers(r.value), setError(null)) : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [panelId])
  useEffect(load, [load])
  const act = (name: string, run: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setBusy(name)
    void run()
      .then((r) => (r.ok ? load() : setError(r.message)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(null))
  }
  const openTerminal = () => {
    useDock.getState().open({ type: 'terminal', projectPath, initialCommand: 'claude /mcp' })
    onClose()
  }
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-label="Servidores MCP" className="w-[min(560px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm outline-none" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Servidores MCP</div>
        {error && <div className="mb-2 text-amber-300">{error}</div>}
        {!servers && !error && <div className="text-neutral-500">Carregando…</div>}
        {servers?.length === 0 && <div className="text-neutral-500">Nenhum servidor MCP configurado.</div>}
        <ul className="space-y-1">
          {servers?.map((s) => (
            <li key={s.name} data-testid="mcp-row" className="flex items-center gap-2 rounded px-2 py-1 hover:bg-neutral-800/60">
              <span className="min-w-0 flex-1">
                <span className="text-neutral-100">{s.name}</span>
                {s.version && <span className="ml-1 text-xs text-neutral-500">v{s.version}</span>}
                {s.scope && <span className="ml-1 text-xs text-neutral-500">· {s.scope}</span>}
                {s.error && <span className="block truncate text-xs text-neutral-500">{s.error}</span>}
              </span>
              <span className={`text-xs ${COLOR[s.status]}`}>{LABEL[s.status]}</span>
              {s.status === 'needs-auth' ? (
                <button className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700" onClick={openTerminal}>
                  Abrir em terminal
                </button>
              ) : (
                <>
                  <button
                    aria-label={`${s.status === 'disabled' ? 'Ligar' : 'Desligar'} ${s.name}`}
                    disabled={busy !== null}
                    className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
                    onClick={() => act(s.name, () => window.api.invoke('agent:toggleMcp', panelId, s.name, s.status === 'disabled'))}
                  >
                    {s.status === 'disabled' ? 'Ligar' : 'Desligar'}
                  </button>
                  {s.status !== 'disabled' && (
                    <button
                      aria-label={`Reconectar ${s.name}`}
                      disabled={busy !== null}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700 disabled:opacity-40"
                      onClick={() => act(s.name, () => window.api.invoke('agent:reconnectMcp', panelId, s.name))}
                    >
                      ↻
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

(confira a assinatura real de `useDialogKeys` no arquivo e adapte `ref`/`tabIndex` ao que ele devolve.)

Create `src/renderer/src/panels/agent/AgentsModal.tsx` no mesmo estilo: carrega `agent:agents`; lista `name` (negrito), `description`, `model` (texto pequeno); vazio → "Nenhum subagente disponível."; rodapé com botão "Gerenciar no terminal" que abre `claude /agents` e fecha; erro inline.

`AgentPanel.tsx`: estados `mcpOpen`, `agentsOpen`; `onLocalCommand`: `mcp` → `setMcpOpen(true)`, `agents` → `setAgentsOpen(true)`; renderizar os modais junto dos outros, passando `projectPath={params.projectPath}`.

- [ ] **Step 4: E2E** — create `e2e/agent-mcp.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/mcp lista servidores, desliga/liga e oferece login no terminal', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/mcp')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Servidores MCP' })
  const github = dialog.getByTestId('mcp-row').filter({ hasText: 'github' })
  await expect(github).toContainText('conectado')
  await expect(dialog.getByTestId('mcp-row').filter({ hasText: 'figma' })).toContainText('precisa de login')

  await dialog.getByRole('button', { name: 'Desligar github' }).click()
  await expect(github).toContainText('desligado')
  await dialog.getByRole('button', { name: 'Ligar github' }).click()
  await expect(github).toContainText('conectado')

  await dialog.getByRole('button', { name: 'Abrir em terminal' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await app.close()
})

test('/agents lista os subagentes e Esc fecha', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/agents')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Subagentes' })
  await expect(dialog).toContainText('code-reviewer')
  await expect(dialog).toContainText('Revisa diffs')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await app.close()
})
```

- [ ] **Step 5: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-mcp.spec.ts e2e/agent-slash.spec.ts`
Expected: PASS. (Se `e2e/agent-slash.spec.ts` usa `/mcp` ou `/agents` como exemplo de comando TUI, troque por `/login`, que continua TUI.)

- [ ] **Step 6: Commit**

```bash
git add -A src test e2e/agent-mcp.spec.ts
git commit -m "feat: /mcp and /agents modals in the agent panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Menção `@agent-` no composer

**Files:**
- Modify: `src/renderer/src/agent/mentions.ts` (`agentMentionItems`)
- Modify: `src/renderer/src/panels/agent/Composer.tsx`
- Modify: `src/renderer/src/panels/agent/MentionMenu.tsx` (rótulo do listbox)
- Test: `test/renderer/mentions.test.ts`, `e2e/mentions.spec.ts` (novo teste no arquivo existente)

**Interfaces:**
- Consumes: IPC `agent:agents` (Task 1).
- Produces:
  - `AGENT_PREFIX = 'agent-'`
  - `agentMentionItems(mention: { query: string; start: number } | null, dismissedAt: number | null, agents: string[] | undefined): string[]` — só quando `mention.query` começa com `agent-` (ou é prefixo de `agent-`, ex. `ag`); devolve `agent-<nome>` filtrado por fuzzy do resto; máximo 8
  - No composer: itens de agente vêm **antes** dos arquivos no mesmo `MentionMenu`; escolher insere `@agent-<nome> ` (via `applyMention`)
  - `MentionMenu` passa a ter `aria-label="Menções"` (arquivos e subagentes)

- [ ] **Step 1: Write the failing tests** — `test/renderer/mentions.test.ts`:

```ts
describe('agentMentionItems', () => {
  const agents = ['Explore', 'general-purpose', 'code-reviewer']
  it('offers agents once the token looks like @agent-', () => {
    expect(agentMentionItems({ query: 'agent-', start: 0 }, null, agents)).toEqual(['agent-Explore', 'agent-general-purpose', 'agent-code-reviewer'])
    expect(agentMentionItems({ query: 'agent-rev', start: 0 }, null, agents)).toEqual(['agent-code-reviewer'])
    expect(agentMentionItems({ query: 'ag', start: 0 }, null, agents)).toHaveLength(3)
  })
  it('stays out of plain file mentions, dismissed tokens and missing lists', () => {
    expect(agentMentionItems({ query: 'src/app', start: 0 }, null, agents)).toEqual([])
    expect(agentMentionItems({ query: '', start: 0 }, null, agents)).toEqual([])
    expect(agentMentionItems({ query: 'agent-', start: 4 }, 4, agents)).toEqual([])
    expect(agentMentionItems({ query: 'agent-', start: 0 }, null, undefined)).toEqual([])
  })
})
```

(adicionar `agentMentionItems` ao import.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/renderer/mentions.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementation**

`mentions.ts`:

```ts
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
```

`Composer.tsx`:
- estado `const [agentNames, setAgentNames] = useState<string[] | undefined>(undefined)`;
- efeito: quando há `mention` e `agentNames === undefined`, carregar uma vez:

```ts
  useEffect(() => {
    if (!mention || agentNames !== undefined) return
    window.api
      .invoke('agent:agents', panelId)
      .then((r) => setAgentNames(r.ok ? r.value.map((a) => a.name) : []))
      .catch(() => setAgentNames([]))
  }, [mention !== null, agentNames, panelId])
```

- `mentionItems` passa a ser `[...agentMentionItems(mention, dismissedAt, agentNames), ...fileItems]`, onde `fileItems` é o cálculo atual (`computeMentionItems(...)`), mantendo o `useMemo` com `agentNames` nas dependências e o total limitado a 8 (`.slice(0, 8)`).
- `pickMention(rel)` não muda (insere `@${rel} `).

`MentionMenu.tsx`: `aria-label="Menções"`. Procure testes/e2e que usam `getByRole('listbox', { name: 'Arquivos' })` (ex. `e2e/mentions.spec.ts`) e troque para `'Menções'`.

- [ ] **Step 4: E2E** — em `e2e/mentions.spec.ts`, novo teste:

```ts
test('@agent- sugere subagentes e insere a menção', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('peça ao @agent-rev')
  const menu = page.getByRole('listbox', { name: 'Menções' })
  await expect(menu).toContainText('@agent-code-reviewer')
  await input.press('Enter')
  await expect(input).toHaveValue('peça ao @agent-code-reviewer ')
  await app.close()
})
```

(importar `openAgent` de `./helpers` se o arquivo ainda não importa.)

- [ ] **Step 5: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/mentions.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src test e2e/mentions.spec.ts
git commit -m "feat: @agent- mentions for subagents in the composer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `/add-dir`

**Files:**
- Modify: `src/shared/models.ts` (`AgentPanelParams.additionalDirectories`)
- Modify: `src/shared/agent.ts` (evento `dirs`)
- Modify: `src/main/agent/AgentSession.ts` (opção, `setDirectories`, corrida do `pump`)
- Modify: `src/main/agent/AgentManager.ts` (passa as pastas; emite estado inicial)
- Modify: `src/shared/ipc-contract.ts` (`agent:setDirs`)
- Modify: `src/main/ipc/handlers.ts` (validação de caminhos)
- Modify: `src/renderer/src/agent/chatReducer.ts`, `src/renderer/src/stores/agentStore.ts`
- Modify: `src/renderer/src/agent/slash.ts` (`add-dir`)
- Create: `src/renderer/src/panels/agent/DirsBar.tsx`
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/main/AgentSession.test.ts`, `test/main/handlers.test.ts`, `test/renderer/chatReducer.test.ts`, `test/renderer/slash.test.ts`, `e2e/agent-add-dir.spec.ts`

**Interfaces:**
- Produces:
  - `AgentPanelParams.additionalDirectories?: string[]`
  - `AgentEvent` `{ kind: 'dirs'; dirs: string[] }`; `ChatState.dirs: string[]` (inicial `[]`)
  - `SessionConfig.additionalDirectories?: string[]`; `QueryOptions.additionalDirectories?: string[]`
  - `AgentSession.setDirectories(dirs: string[]): Outcome<null>` — recusa com `running`/`awaiting_permission` (`'Pare o agente antes de mudar as pastas.'`); guarda a lista; se há query, fecha-a mantendo `sessionId` (a próxima mensagem retoma); emite `dirs`
  - IPC `'agent:setDirs': { args: [panelId: string, dirs: string[]]; result: Outcome<string[]> }` — valida no main: absoluto, existe, é pasta; resolve `realpath`; remove duplicadas; devolve a lista final
  - `LocalCommand` inclui `'add-dir'`; `LOCAL_COMMANDS` ganha `{ name: 'add-dir', description: 'Dar acesso a outra pasta', argumentHint: '[caminho]', local: true }` depois de `agents`
  - `DirsBar({ panelId, dirs, onRemove })` com `data-testid="dirs-bar"`, chip por pasta com botão `aria-label="Remover pasta <basename>"`

- [ ] **Step 1: Write the failing tests**

`test/main/AgentSession.test.ts`:

```ts
  describe('additional directories', () => {
    it('passes directories on start and restarts the query (same session) when they change', async () => {
      const f = fake()
      const { s, events } = session(f.fn, { additionalDirectories: ['/extra/a'] })
      s.send('oi')
      await tick()
      expect(f.calls[0]!.options.additionalDirectories).toEqual(['/extra/a'])
      f.out.push(INIT)
      f.out.push(RESULT)
      await tick()
      expect(s.setDirectories(['/extra/a', '/extra/b'])).toEqual({ ok: true, value: null })
      expect(f.q.close).toHaveBeenCalled()
      expect(events).toContainEqual({ kind: 'dirs', dirs: ['/extra/a', '/extra/b'] })
      s.send('de novo')
      await tick()
      expect(f.calls).toHaveLength(2)
      expect(f.calls[1]!.options).toMatchObject({ resume: 'sess-9', additionalDirectories: ['/extra/a', '/extra/b'] })
    })

    it('refuses while running and survives the old pump ending after the restart', async () => {
      const f = fake()
      const { s } = session(f.fn)
      s.send('oi')
      await tick()
      expect(s.setDirectories(['/x'])).toEqual({ ok: false, message: 'Pare o agente antes de mudar as pastas.' })
      f.out.push(RESULT)
      await tick()
      expect(s.setDirectories(['/x'])).toEqual({ ok: true, value: null })
      s.send('depois')
      await tick()
      // the first query's pump finishing late must not drop the new query
      await tick()
      expect(s.isStarted).toBe(true)
    })
  })
```

Nota: o helper `fake()` reusa **o mesmo** `q`/`out` para todas as chamadas de `fn`; o segundo teste só garante que o `pump` antigo não zera a query nova. Se o helper não permitir distinguir as queries, ajuste o `fake()` localmente no teste para devolver uma query nova por chamada (crie `fake2()` no próprio arquivo).

`test/main/handlers.test.ts`:

```ts
  it('agent:setDirs validates, resolves and dedupes directories', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dirs-'))
    const file = join(base, 'f.txt')
    writeFileSync(file, 'x')
    const h = buildHandlers(deps())
    await h['agent:create']('p1', { type: 'agent', projectPath: '/p' })
    await expect(h['agent:setDirs']('p1', [base, `${base}/`, base])).resolves.toEqual({ ok: true, value: [realpathSync(base)] })
    await expect(h['agent:setDirs']('p1', ['relativo'])).resolves.toMatchObject({ ok: false, message: expect.stringContaining('relativo') })
    await expect(h['agent:setDirs']('p1', [join(base, 'nao-existe')])).resolves.toMatchObject({ ok: false })
    await expect(h['agent:setDirs']('p1', [file])).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é uma pasta') })
  })
```

(importar `realpathSync` de `node:fs`.)

`test/renderer/chatReducer.test.ts`: `reduceChat(initialChat, { kind: 'dirs', dirs: ['/a'] }).dirs` é `['/a']`.

`test/renderer/slash.test.ts`: lista de `mergeCommands` ganha `'add-dir'` depois de `'agents'`; `classifySlash('/add-dir /tmp/x')` → `{ kind: 'local', name: 'add-dir', arg: '/tmp/x' }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/AgentSession.test.ts test/main/handlers.test.ts test/renderer/chatReducer.test.ts test/renderer/slash.test.ts`
Expected: FAIL.

- [ ] **Step 3: Main**

`AgentSession.ts`:
- `SessionConfig.additionalDirectories?: string[]`; `QueryOptions.additionalDirectories?: string[]`; campo `private dirs: string[]` iniciado com `config.additionalDirectories ?? []`;
- `start()`: `...(this.dirs.length ? { additionalDirectories: this.dirs } : {}),`;
- corrida do pump (Review Focus #3): em `pump(query)`, trocar `if (!this.closed) this.reset('idle')` por `if (!this.closed && this.query === query) this.reset('idle')` e, no `catch`, `if (this.closed || this.query !== query) return` antes de emitir o erro;
- método:

```ts
  /** additionalDirectories only apply when a query starts: drop the current one; the next send resumes it with the new list. */
  setDirectories(dirs: string[]): Outcome<null> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    if (this.state === 'running' || this.state === 'awaiting_permission') return { ok: false, message: 'Pare o agente antes de mudar as pastas.' }
    this.dirs = [...dirs]
    const query = this.query
    if (query) {
      this.input?.end()
      this.query = null
      this.input = null
      this.abort = null
      this.turnsInFlight = 0
      query.close()
    }
    this.emit({ kind: 'dirs', dirs: this.dirs })
    return { ok: true, value: null }
  }
```

`AgentManager.create`: `...(params.additionalDirectories?.length ? { additionalDirectories: params.additionalDirectories } : {})` na config e, depois do evento de `effort`, `this.deps.emit(panelId, { kind: 'dirs', dirs: params.additionalDirectories ?? [] })` (ajuste o teste de eventos do `create` em `AgentManager.test.ts`).

`handlers.ts` (importar `stat`, `realpath` de `node:fs/promises` e `isAbsolute` de `node:path`):

```ts
    'agent:setDirs': async (panelId, dirs) => {
      await d.agentReady()
      const resolved: string[] = []
      for (const dir of dirs) {
        if (!isAbsolute(dir)) return { ok: false as const, message: `Use um caminho absoluto: ${dir}` }
        try {
          const real = await realpath(dir)
          if (!(await stat(real)).isDirectory()) return { ok: false as const, message: `${dir} não é uma pasta.` }
          if (!resolved.includes(real)) resolved.push(real)
        } catch {
          return { ok: false as const, message: `Pasta não encontrada: ${dir}` }
        }
      }
      const r = d.agents.get(panelId).setDirectories(resolved)
      return r.ok ? { ok: true as const, value: resolved } : r
    },
```

IPC no `ipc-contract.ts` + `INVOKE_CHANNELS`.

- [ ] **Step 4: Renderer**

- `models.ts`: `AgentPanelParams.additionalDirectories?: string[]`.
- `chatReducer.ts`: `ChatState.dirs: string[]`, `initialChat.dirs = []`, `case 'dirs': return { ...s, dirs: e.dirs }`.
- `agentStore.ts` `handleAgentEvent`: `if (event.kind === 'dirs') persistParams(panelId, { additionalDirectories: event.dirs.length ? event.dirs : undefined })`.
- `AgentPanel.tsx` — `base()` passa a carregar `additionalDirectories` (como `effort`): as pastas são do painel, sobrevivem a `/clear`, `/resume` e rewind. Comando:

```ts
  const setDirs = (dirs: string[]) =>
    void window.api
      .invoke('agent:setDirs', panelId, dirs)
      .then((r) => {
        if (!r.ok) notify(r.message)
      })
      .catch((err) => notify(errorText(err)))

  const addDir = (arg: string) => {
    if (pendingRef.current) return notify(pendingRef.current)
    if (isBusy(liveChat())) return notify('Pare o agente antes de mudar as pastas.')
    const current = liveChat().dirs
    if (arg) return setDirs([...current, arg])
    void window.api.invoke('fs:pickFolder').then((picked) => picked.length && setDirs([...current, ...picked]))
  }
```

`onLocalCommand`: `add-dir` → `addDir(arg)`.

Create `src/renderer/src/panels/agent/DirsBar.tsx`:

```tsx
import { basename } from '@shared/workspaces'

export function DirsBar({ dirs, onRemove }: { dirs: string[]; onRemove(dir: string): void }) {
  if (dirs.length === 0) return null
  return (
    <div data-testid="dirs-bar" className="mx-2 mb-1 flex flex-wrap gap-1 text-xs">
      {dirs.map((dir) => (
        <span key={dir} title={dir} className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300">
          +{basename(dir)}
          <button aria-label={`Remover pasta ${basename(dir)}`} className="text-neutral-500 hover:text-neutral-200" onClick={() => onRemove(dir)}>
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
```

Renderizar logo acima do `TasksBar`: `<DirsBar dirs={chat.dirs} onRemove={(dir) => setDirs(chat.dirs.filter((d) => d !== dir))} />`.

`slash.ts`: `LocalCommand` + `LOCAL_COMMANDS` conforme Interfaces.

- [ ] **Step 5: E2E** — create `e2e/agent-add-dir.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { openAgent } from './helpers'

test('/add-dir adiciona pasta, persiste, remove e recusa caminho inválido', async () => {
  const { app, page, userData } = await openAgent()
  const extra = realpathSync(mkdtempSync(join(tmpdir(), 'extra-dir-')))
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/add-dir relativo')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Use um caminho absoluto')

  await input.fill(`/add-dir ${extra}`)
  await input.press('Enter')
  await expect(page.getByTestId('dirs-bar')).toContainText(basename(extra))
  await expect
    .poll(() => {
      try {
        return readFileSync(join(userData, 'layout.json'), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain(extra)

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')

  await page.getByRole('button', { name: `Remover pasta ${basename(extra)}` }).click()
  await expect(page.getByTestId('dirs-bar')).toHaveCount(0)
  await app.close()
})
```

- [ ] **Step 6: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-add-dir.spec.ts e2e/agent.spec.ts e2e/agent-restore.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src test e2e/agent-add-dir.spec.ts
git commit -m "feat: /add-dir gives the agent access to extra folders, persisted per panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verificação final do 4C

- [ ] **Step 1:** `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test` — tudo verde (instáveis conhecidos: rodar isolados).
- [ ] **Step 2: Smoke real** (script fora do repo, `claude` real, haiku, `settingSources: ['user']` para ver os MCP do usuário): `mcpServerStatus()` lista os servidores do usuário; `supportedAgents()` lista subagentes; query com `additionalDirectories: [<pasta temp com arquivo x.txt>]` e prompt "leia <pasta>/x.txt com Read e diga o conteúdo" responde o conteúdo sem pedir permissão de diretório. Registrar no ledger.
