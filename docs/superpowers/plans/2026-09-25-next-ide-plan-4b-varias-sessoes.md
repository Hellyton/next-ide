# Plano 4B — Várias sessões (notificações, /fork, tarefas em segundo plano) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificações do macOS quando um painel termina/pede permissão/dá erro fora de foco, `/fork` abrindo a sessão copiada num painel ao lado, e barra de tarefas em segundo plano (lista, parar, Ctrl+B).

**Architecture:** Notificações ficam no main (o estado de cada painel já passa pelo `AgentManager`): uma função pura decide a notificação a partir da transição de estado, e um `AgentNotifier` com dependências injetadas (foco, habilitado, mostrar) dispara `Notification` do Electron. `/fork` reaproveita `SessionStoreApi.fork` (Task 5 do 4A) sem `upToMessageId` e abre um painel com `sessionId` novo ao lado (mesmo caminho do restore). Tarefas: `StreamNormalizer` converte `system` `task_started`/`task_progress`/`task_notification` em eventos; `chatReducer` mantém `tasks`; `TasksBar` acima do composer com parar (`stopTask`) e Ctrl+B (`backgroundTasks`).

**Tech Stack:** Electron (Notification, Menu), React + zustand, `@anthropic-ai/claude-agent-sdk` 0.3.268, vitest, Playwright + `fakeQuery`.

**Spec:** `docs/superpowers/specs/2026-09-25-next-ide-paridade-cli-design.md` (seções 3, 5, 7, 8).

## Global Constraints

- Branch: `fix/ajustes-visuais`. Commits `feat: ...`/`fix: ...` terminando com exatamente `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Textos de UI em pt-BR. Sem dependências novas.
- Convenções já em vigor (do plano 4A): `notify(message)` no `AgentPanel` escreve no aviso do composer (`useAgents.getState().setNotice(panelId, { text, command: '' })`, `data-testid="composer-notice"`); id de sessão = `chat.sessionId ?? currentAgentParams(panelId)?.sessionId`; guarda `pending`/`pendingRef` no `AgentPanel` bloqueia operações que reiniciam/abrem sessão em paralelo; `Outcome<T>`/`unsupported()`/`failure()` em `AgentSession.ts`.
- Método do SDK ausente → `{ ok: false, message: '<recurso> não é suportado por esta versão do Claude Code.' }` via `unsupported()`, mostrado no `composer-notice`.
- Comandos: `npm run typecheck`, `npx vitest run`, e2e `npx electron-vite build && npx playwright test <spec>`. `e2e/agent-restore.spec.ts`, `e2e/file-edit.spec.ts` e `e2e/quickopen.spec.ts` são intermitentes sob carga: se falharem, rodar isolados e reportar os dois resultados.

## Review Focus

1. Notificação só com a janela **sem foco**; `running → idle` depois de um `/clear` ou restart (transição sintética) não deve notificar "terminou" se não houve turno — só notificar `idle` quando o estado anterior era `running` ou `awaiting_permission` — Task 1.
2. Clique na notificação com a janela minimizada: restaura, foca e ativa o painel certo — Task 1 (verificação manual documentada).
3. `/fork` antes da primeira mensagem (sem transcript): aviso, sem chamar o SDK; `/fork` com agente rodando é permitido (a cópia é do transcript salvo) — Task 2.
4. Tarefa que termina depois do fim do turno (painel já `idle`): a barra atualiza e some; um restart da query (resume//clear/crash) não deixa tarefas "fantasmas" rodando na barra — Task 3.
5. Ctrl+B com o agente parado não faz nada; `backgroundTasks()` lançando (tarefas em segundo plano desativadas) vira aviso, não quebra — Task 4.

---

### Task 1: Notificações do macOS

**Files:**
- Create: `src/main/agent/notifications.ts`
- Modify: `src/main/agent/AgentManager.ts` (`projectOf`)
- Modify: `src/shared/models.ts` (`Settings.notifications?: boolean`)
- Modify: `src/shared/ipc-contract.ts` (evento `agent:focus`)
- Modify: `src/main/menu.ts` (item "Notificações dos agentes")
- Modify: `src/main/index.ts` (liga notifier, menu, clique)
- Modify: `src/renderer/src/stores/agentStore.ts` (assina `agent:focus`)
- Test: `test/main/notifications.test.ts`, `test/main/AgentManager.test.ts`

**Interfaces:**
- Produces:
  - `notificationFor(prev: SessionState | undefined, next: SessionState): { reason: 'done' | 'permission' | 'error' } | null`
  - `class AgentNotifier { constructor(deps: NotifierDeps); onEvent(panelId: string, event: AgentEvent): void; forget(panelId: string): void }`
  - `type NotifierDeps = { isFocused(): boolean; enabled(): boolean; projectOf(panelId: string): string | undefined; show(n: { title: string; body: string; panelId: string }): void }`
  - `AgentManager.projectOf(panelId: string): string | undefined`
  - `EventMap['agent:focus']: [panelId: string]`
  - `installMenu(opts: { notifications: boolean; onToggleNotifications(enabled: boolean): void }): void`

- [ ] **Step 1: Write the failing tests** — create `test/main/notifications.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { AgentNotifier, notificationFor } from '../../src/main/agent/notifications'

describe('notificationFor', () => {
  it('notifies when a turn finishes, asks for permission or fails', () => {
    expect(notificationFor('running', 'idle')).toEqual({ reason: 'done' })
    expect(notificationFor('awaiting_permission', 'idle')).toEqual({ reason: 'done' })
    expect(notificationFor('running', 'awaiting_permission')).toEqual({ reason: 'permission' })
    expect(notificationFor('running', 'error')).toEqual({ reason: 'error' })
  })
  it('ignores synthetic or repeated transitions', () => {
    expect(notificationFor(undefined, 'idle')).toBeNull()
    expect(notificationFor('exited', 'idle')).toBeNull()
    expect(notificationFor('idle', 'running')).toBeNull()
    expect(notificationFor('error', 'error')).toBeNull()
    expect(notificationFor('running', 'exited')).toBeNull()
  })
})

function notifier(over: Partial<ConstructorParameters<typeof AgentNotifier>[0]> = {}) {
  const shown: Array<{ title: string; body: string; panelId: string }> = []
  const n = new AgentNotifier({
    isFocused: () => false,
    enabled: () => true,
    projectOf: () => '/g/api',
    show: (x) => void shown.push(x),
    ...over,
  })
  return { n, shown }
}

describe('AgentNotifier', () => {
  it('shows one notification per transition with the project name', () => {
    const { n, shown } = notifier()
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'awaiting_permission' })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    expect(shown).toEqual([
      { title: 'api · Claude', body: 'Pedindo permissão', panelId: 'p1' },
      { title: 'api · Claude', body: 'Terminou', panelId: 'p1' },
    ])
  })
  it('stays quiet while focused or disabled, and ignores non-status events', () => {
    let focused = true
    let enabled = true
    const { n, shown } = notifier({ isFocused: () => focused, enabled: () => enabled })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    focused = false
    enabled = false
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'error' })
    n.onEvent('p1', { kind: 'query-start' })
    expect(shown).toEqual([])
  })
  it('forget drops the previous state so a new panel with the same id starts clean', () => {
    const { n, shown } = notifier()
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.forget('p1')
    n.onEvent('p1', { kind: 'status', state: 'idle' })
    expect(shown).toEqual([])
  })
  it('shows the error body', () => {
    const { n, shown } = notifier({ projectOf: () => undefined })
    n.onEvent('p1', { kind: 'status', state: 'running' })
    n.onEvent('p1', { kind: 'status', state: 'error' })
    expect(shown).toEqual([{ title: 'Claude', body: 'Erro na sessão', panelId: 'p1' }])
  })
})
```

Em `test/main/AgentManager.test.ts`, novo `it` (siga o helper do arquivo para construir o manager):

```ts
  it('remembers the project of each panel until it is closed', () => {
    const m = new AgentManager({ emit: () => undefined, runtime: () => ({ queryFn: fakeQuery }) })
    m.create('p1', { type: 'agent', projectPath: '/g/api' })
    expect(m.projectOf('p1')).toBe('/g/api')
    m.close('p1')
    expect(m.projectOf('p1')).toBeUndefined()
  })
```

(importar `fakeQuery` se o arquivo ainda não importa.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/notifications.test.ts test/main/AgentManager.test.ts`
Expected: FAIL (módulo/método inexistente).

- [ ] **Step 3: Implementation**

Create `src/main/agent/notifications.ts`:

```ts
import { basename } from 'node:path'
import type { AgentEvent } from '@shared/agent'
import type { SessionState } from '@shared/models'

export type NotificationReason = 'done' | 'permission' | 'error'

const WORKING: ReadonlySet<SessionState | undefined> = new Set(['running', 'awaiting_permission'])

/** What to tell the user about a panel's state change; null for synthetic/boring transitions. */
export function notificationFor(prev: SessionState | undefined, next: SessionState): { reason: NotificationReason } | null {
  if (prev === next) return null
  if (next === 'awaiting_permission') return { reason: 'permission' }
  if (next === 'error') return WORKING.has(prev) ? { reason: 'error' } : null
  if (next === 'idle') return WORKING.has(prev) ? { reason: 'done' } : null
  return null
}

const BODY: Record<NotificationReason, string> = { done: 'Terminou', permission: 'Pedindo permissão', error: 'Erro na sessão' }

export type NotifierDeps = {
  isFocused(): boolean
  enabled(): boolean
  projectOf(panelId: string): string | undefined
  show(n: { title: string; body: string; panelId: string }): void
}

/** Turns agent status events into OS notifications while the window is in the background. */
export class AgentNotifier {
  private readonly states = new Map<string, SessionState>()

  constructor(private readonly deps: NotifierDeps) {}

  onEvent(panelId: string, event: AgentEvent): void {
    if (event.kind !== 'status') return
    const prev = this.states.get(panelId)
    this.states.set(panelId, event.state)
    const n = notificationFor(prev, event.state)
    if (!n || this.deps.isFocused() || !this.deps.enabled()) return
    const project = this.deps.projectOf(panelId)
    this.deps.show({ title: project ? `${basename(project)} · Claude` : 'Claude', body: BODY[n.reason], panelId })
  }

  forget(panelId: string): void {
    this.states.delete(panelId)
  }
}
```

`src/main/agent/AgentManager.ts`: campo `private readonly projects = new Map<string, string>()`; em `create` (depois do guard de existência) `this.projects.set(panelId, params.projectPath)`; em `close` `this.projects.delete(panelId)`; método:

```ts
  projectOf(panelId: string): string | undefined {
    return this.projects.get(panelId)
  }
```

`src/shared/models.ts` — `Settings` ganha:

```ts
  /** macOS notifications when a panel finishes, asks for permission or fails while the window is in the background. Default on. */
  notifications?: boolean
```

`src/shared/ipc-contract.ts` — `EventMap` ganha `'agent:focus': [panelId: string]` e `'agent:focus'` entra em `EVENT_CHANNELS`.

`src/main/menu.ts`:

```ts
export function installMenu(opts: { notifications: boolean; onToggleNotifications(enabled: boolean): void }): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { /* Exibir: igual ao atual */ },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Notificações dos agentes',
          type: 'checkbox',
          checked: opts.notifications,
          click: (item) => opts.onToggleNotifications(item.checked),
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

(manter o submenu "Exibir" exatamente como está hoje.)

`src/main/index.ts`:
- importar `Notification` de `electron` e `AgentNotifier` de `./agent/notifications`;
- estado: `let notificationsEnabled = true`;
- criar o notifier antes do `AgentManager` e encadear no `emit` do manager (ache a construção atual do `AgentManager` — hoje ela passa `emit: (panelId, event) => send('agent:event', panelId, event)`):

```ts
const notifier = new AgentNotifier({
  isFocused: () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()),
  enabled: () => notificationsEnabled && Notification.isSupported(),
  projectOf: (panelId) => agents.projectOf(panelId),
  show: ({ title, body, panelId }) => {
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      send('agent:focus', panelId)
    })
    n.show()
  },
})
```

e no emit do `AgentManager`: `emit: (panelId, event) => { notifier.onEvent(panelId, event); send('agent:event', panelId, event) }`. Em `agent:close` o painel some: chamar `notifier.forget(panelId)` — faça isso encapsulando `agents.close` no ponto onde o `AgentManager` é criado não é possível; em vez disso, passe no `HandlerDeps.agents` o próprio manager e adicione no `emit` acima: `if (event.kind === 'status' && event.state === 'exited') notifier.forget(panelId)` (o `close()` do `AgentSession` emite `exited`).
- `installMenu` no `whenReady`: ler as configurações antes:

```ts
  const settings = await stores.settings.read()
  notificationsEnabled = settings.notifications !== false
  installMenu({
    notifications: notificationsEnabled,
    onToggleNotifications: (enabled) => {
      notificationsEnabled = enabled
      void stores.settings.read().then((s) => stores.settings.schedule({ ...s, notifications: enabled }))
    },
  })
```

(o callback do `whenReady` precisa virar `async`; se `stores.settings` não tiver `schedule`, use o mesmo método que o handler `settings:save` usa hoje.)

`src/renderer/src/stores/agentStore.ts` — em `subscribeAgentEvents`, depois do `window.api.on('agent:event', ...)`:

```ts
  window.api.on('agent:focus', (panelId) => useDock.getState().focus(panelId))
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run test/main/notifications.test.ts test/main/AgentManager.test.ts && npm run typecheck && npx vitest run`
Expected: PASS. (Se algum teste de `handlers`/`register` verificar a lista de `EVENT_CHANNELS` literalmente, atualize-o com `'agent:focus'`.)

- [ ] **Step 5: Verificação manual (registrar no relatório)**

`npm run dev`, abrir um painel, mandar uma mensagem longa, trocar de app (janela sem foco) → notificação "`<projeto> · Claude` — Terminou"; clicar → janela volta e o painel fica ativo. Desmarcar "Janela → Notificações dos agentes" → nenhuma notificação; reabrir o app → continua desmarcado.

- [ ] **Step 6: Commit**

```bash
git add -A src test
git commit -m "feat: macOS notifications when a panel finishes, asks for permission or fails in the background

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `/fork`

**Files:**
- Modify: `src/main/agent/sdk.ts` (`fork` com `upToMessageId` opcional)
- Modify: `src/main/agent/fakeQuery.ts` (`fakeSessions.fork` aceita a nova assinatura)
- Modify: `src/main/index.ts` (repasse)
- Modify: `src/shared/ipc-contract.ts` (`agent:fork`)
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/renderer/src/agent/slash.ts` (comando `fork`)
- Modify: `src/renderer/src/dock/dockStore.ts` (`openBeside`)
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Test: `test/main/handlers.test.ts`, `test/renderer/slash.test.ts`, `test/renderer/dockStore.test.ts`, `e2e/agent-fork.spec.ts`

**Interfaces:**
- Consumes: `SessionStoreApi.fork` e `forkBefore` (4A), `pending`/`notify` do `AgentPanel`.
- Produces:
  - `SessionStoreApi.fork(dir: string, sessionId: string, upToMessageId?: string, title?: string): Promise<string>`
  - IPC `'agent:fork': { args: [projectPath: string, sessionId: string, title?: string]; result: Outcome<string> }` (novo sessionId)
  - `LocalCommand` inclui `'fork'`; `LOCAL_COMMANDS` ganha `{ name: 'fork', description: 'Copiar esta conversa para um painel novo ao lado', argumentHint: '[título]', local: true }` depois de `rename`
  - `useDock.getState().openBeside(referencePanelId: string, params: PanelParams): string | null`

- [ ] **Step 1: Write the failing tests**

`test/main/handlers.test.ts`:

```ts
  it('agent:fork copies the whole session, forwarding the title', async () => {
    const fork = vi.fn(async () => 'fake-fork')
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork } }))
    await expect(h['agent:fork']('/proj', 'fake-old', ' Experimento ')).resolves.toEqual({ ok: true, value: 'fake-fork' })
    expect(fork).toHaveBeenCalledWith('/proj', 'fake-old', undefined, 'Experimento')
    await h['agent:fork']('/proj', 'fake-old')
    expect(fork).toHaveBeenLastCalledWith('/proj', 'fake-old', undefined, undefined)
  })

  it('agent:fork reports failures', async () => {
    const h = buildHandlers(deps({ sessions: { ...fakeSessions, fork: async () => { throw new Error('sem transcript') } } }))
    await expect(h['agent:fork']('/proj', 'x')).resolves.toEqual({ ok: false, message: 'sem transcript' })
  })
```

`test/renderer/slash.test.ts` — acrescentar `'fork'` à lista esperada de `mergeCommands` logo depois de `'rename'`, e:

```ts
    expect(classifySlash('/fork')).toEqual({ kind: 'local', name: 'fork', arg: '' })
    expect(classifySlash('/fork Experimento A')).toEqual({ kind: 'local', name: 'fork', arg: 'Experimento A' })
```

`test/renderer/dockStore.test.ts` — seguindo o fake de `api` já usado no arquivo (ele registra `addPanel`), novo `it`:

```ts
  it('openBeside splits to the right of the reference panel', () => {
    // use the file's fake api; assert addPanel got position { referencePanel: 'agent-1', direction: 'right' }
    const id = useDock.getState().openBeside('agent-1', { type: 'agent', projectPath: '/g/api', sessionId: 's2' })
    expect(id).toMatch(/^agent-/)
    expect(addPanel).toHaveBeenLastCalledWith(expect.objectContaining({ params: { type: 'agent', projectPath: '/g/api', sessionId: 's2' }, position: { referencePanel: 'agent-1', direction: 'right' } }))
  })
```

(adapte `addPanel` ao nome do spy existente no arquivo; se o arquivo não tiver fake de `api`, crie um mínimo com `addPanel: vi.fn()` e `setApi`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/handlers.test.ts test/renderer/slash.test.ts test/renderer/dockStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`src/main/agent/sdk.ts`:

```ts
  fork(dir: string, sessionId: string, upToMessageId?: string, title?: string): Promise<string>
```

```ts
    fork: async (dir, sessionId, upToMessageId, title) =>
      (await sdk.forkSession(sessionId, { dir, ...(upToMessageId ? { upToMessageId } : {}), ...(title ? { title } : {}) })).sessionId,
```

(o `agent:forkBefore` continua passando `upToMessageId`; confira que compila sem mudança.)

`src/shared/ipc-contract.ts`:

```ts
  'agent:fork': { args: [projectPath: string, sessionId: string, title?: string]; result: Outcome<string> }
```

+ `'agent:fork',` em `INVOKE_CHANNELS`.

`src/main/ipc/handlers.ts` (reusar o helper `failed` e a mesma limpeza de título do `agent:rename`, extraindo-a para uma função local `cleanTitle(title: string): string` usada pelos dois):

```ts
    'agent:fork': async (projectPath, sessionId, title) => {
      await d.agentReady()
      try {
        const clean = title === undefined ? undefined : cleanTitle(title) || undefined
        return { ok: true as const, value: await d.sessions.fork(projectPath, sessionId, undefined, clean) }
      } catch (err) {
        return failed(err)
      }
    },
```

`src/renderer/src/agent/slash.ts`: `LocalCommand` ganha `'fork'`; entrada em `LOCAL_COMMANDS` conforme Interfaces.

`src/renderer/src/dock/dockStore.ts` — tipo + implementação:

```ts
  openBeside(referencePanelId: string, params: PanelParams): string | null
```

```ts
  openBeside: (referencePanelId, params) => {
    const api = get().api
    if (!api) return null
    if (!api.getPanel(referencePanelId)) return get().open(params)
    const id = newPanelId(params.type)
    api.addPanel(buildAddPanelOptions(params, id, { kind: 'split', referencePanelId, direction: 'right' }))
    return id
  },
```

`AgentPanel.tsx` — em `onLocalCommand`: `else if (name === 'fork') forkSession(arg)`, e:

```ts
  const forkSession = (title: string) => {
    if (pendingRef.current) return
    const sessionId = liveSessionId()
    const hasTranscript = liveChat().items.some((it) => it.type === 'user')
    if (!sessionId || !hasTranscript) return notify('Envie uma mensagem antes de copiar a sessão.')
    setPending('Copiando sessão…')
    void window.api
      .invoke('agent:fork', params.projectPath, sessionId, title || undefined)
      .then((r) => {
        if (!r.ok) return notify(r.message)
        const current = currentAgentParams(panelId) ?? params
        useDock.getState().openBeside(panelId, {
          type: 'agent',
          projectPath: current.projectPath,
          sessionId: r.value,
          ...(current.model ? { model: current.model } : {}),
          ...(current.permissionMode ? { permissionMode: current.permissionMode } : {}),
          ...(current.effort ? { effort: current.effort } : {}),
          ...(title ? { title } : {}),
        })
      })
      .catch((err) => notify(errorText(err)))
      .finally(() => setPending(null))
  }
```

Notas: `liveSessionId`, `liveChat`, `setPending`, `pendingRef` já existem no `AgentPanel` (fix wave do 4A) — confira os nomes reais no arquivo e use-os. `setPending(text)` deve mostrar o texto no aviso do composer como o rewind faz; se hoje ele só guarda o estado, siga o mesmo padrão que o rewind usa para mostrar "Voltando…". `/fork` **não** checa `busy` (Review Focus #3).

- [ ] **Step 4: E2E**

Create `e2e/agent-fork.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/fork abre a sessão copiada num painel ao lado; antes da primeira mensagem avisa', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/fork')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Envie uma mensagem antes de copiar a sessão.')

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')

  await input.fill('/fork Experimento')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'Experimento · claude' })).toBeVisible()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  // fakeSessions: the 'fake-fork' transcript is the first turn of the fake history.
  await expect(page.getByTestId('agent-panel').last().getByTestId('chat-view')).toContainText('resposta antiga')
  await app.close()
})
```

- [ ] **Step 5: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-fork.spec.ts e2e/agent-rewind.spec.ts e2e/agent-slash.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src test e2e/agent-fork.spec.ts
git commit -m "feat: /fork copies the session into a new panel beside the current one

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Eventos e estado de tarefas em segundo plano

**Files:**
- Modify: `src/shared/agent.ts` (eventos `task-*`, tipo `TaskInfo`)
- Modify: `src/main/agent/normalize.ts` (mensagens `system` `task_*`)
- Modify: `src/renderer/src/agent/chatReducer.ts` (`ChatState.tasks`)
- Test: `test/main/normalize.test.ts`, `test/renderer/chatReducer.test.ts`

**Interfaces:**
- Produces:
  - `export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped'`
  - `export type TaskInfo = { id: string; description: string; status: TaskStatus; toolUseId?: string; lastToolName?: string; totalTokens?: number; toolUses?: number; durationMs?: number; summary?: string }`
  - `AgentEvent` ganha:
    - `{ kind: 'task-started'; id: string; description: string; toolUseId?: string }`
    - `{ kind: 'task-progress'; id: string; description?: string; lastToolName?: string; totalTokens: number; toolUses: number; durationMs: number }`
    - `{ kind: 'task-done'; id: string; status: 'completed' | 'failed' | 'stopped'; summary: string }`
  - `ChatState.tasks: TaskInfo[]` (em `initialChat`: `tasks: []`)

- [ ] **Step 1: Write the failing tests**

`test/main/normalize.test.ts`:

```ts
describe('task messages', () => {
  it('turns task_started / task_progress / task_notification into task events', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', task_id: 't1', tool_use_id: 'tu1', description: 'npm test' })).toEqual([
      { kind: 'task-started', id: 't1', description: 'npm test', toolUseId: 'tu1' },
    ])
    expect(
      n.push({ type: 'system', subtype: 'task_progress', task_id: 't1', description: 'npm test', last_tool_name: 'Bash', usage: { total_tokens: 10, tool_uses: 2, duration_ms: 1500 } }),
    ).toEqual([{ kind: 'task-progress', id: 't1', description: 'npm test', lastToolName: 'Bash', totalTokens: 10, toolUses: 2, durationMs: 1500 }])
    expect(n.push({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'ok', output_file: '/x' })).toEqual([
      { kind: 'task-done', id: 't1', status: 'completed', summary: 'ok' },
    ])
  })
  it('drops malformed task messages', () => {
    const n = new StreamNormalizer()
    expect(n.push({ type: 'system', subtype: 'task_started', description: 'sem id' })).toEqual([])
    expect(n.push({ type: 'system', subtype: 'task_notification', task_id: 't', status: 'weird', summary: '' })).toEqual([])
  })
})
```

`test/renderer/chatReducer.test.ts`:

```ts
describe('tasks', () => {
  it('tracks a task from start to done', () => {
    let s = reduceChat(initialChat, { kind: 'task-started', id: 't1', description: 'npm test', toolUseId: 'tu1' })
    expect(s.tasks).toEqual([{ id: 't1', description: 'npm test', status: 'running', toolUseId: 'tu1' }])
    s = reduceChat(s, { kind: 'task-progress', id: 't1', lastToolName: 'Bash', totalTokens: 10, toolUses: 2, durationMs: 1500 })
    expect(s.tasks[0]).toMatchObject({ status: 'running', lastToolName: 'Bash', toolUses: 2, durationMs: 1500 })
    s = reduceChat(s, { kind: 'task-done', id: 't1', status: 'stopped', summary: 'parado' })
    expect(s.tasks[0]).toMatchObject({ status: 'stopped', summary: 'parado' })
  })
  it('ignores progress/done for unknown tasks and restarts with an empty list on a new query', () => {
    let s = reduceChat(initialChat, { kind: 'task-progress', id: 'x', totalTokens: 0, toolUses: 0, durationMs: 0 })
    s = reduceChat(s, { kind: 'task-done', id: 'x', status: 'completed', summary: '' })
    expect(s.tasks).toEqual([])
    s = reduceChat(s, { kind: 'task-started', id: 't1', description: 'a' })
    s = reduceChat(s, { kind: 'query-start' })
    expect(s.tasks).toEqual([])
  })
  it('drops running tasks when the session exits', () => {
    let s = reduceChat(initialChat, { kind: 'task-started', id: 't1', description: 'a' })
    s = reduceChat(s, { kind: 'status', state: 'exited' })
    expect(s.tasks).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/normalize.test.ts test/renderer/chatReducer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`src/shared/agent.ts`: tipos e membros de `AgentEvent` conforme Interfaces.

`src/main/agent/normalize.ts` — no `case 'system'`:

```ts
      case 'system':
        if (message.subtype === 'init') return [this.init(message)]
        return this.task(message)
```

e o método (usa `isRec`/`str` do arquivo; `finite` já existe desde o 4A):

```ts
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
```

(se `str` devolver `''` para vazio em vez de `undefined`, os `if (!id)` continuam corretos.)

`src/renderer/src/agent/chatReducer.ts`:
- `ChatState` ganha `tasks: TaskInfo[]`; `initialChat` ganha `tasks: []`;
- `case 'query-start'`: além do que já faz, `tasks: []`;
- `case 'status'`: `return { ...s, state: e.state, ...(e.state === 'exited' ? { tasks: [] } : {}) }`;
- novos cases:

```ts
    case 'task-started':
      return {
        ...s,
        tasks: [...s.tasks.filter((t) => t.id !== e.id), { id: e.id, description: e.description, status: 'running', ...(e.toolUseId ? { toolUseId: e.toolUseId } : {}) }],
      }
    case 'task-progress': {
      if (!s.tasks.some((t) => t.id === e.id)) return s
      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === e.id
            ? { ...t, ...(e.description ? { description: e.description } : {}), ...(e.lastToolName ? { lastToolName: e.lastToolName } : {}), totalTokens: e.totalTokens, toolUses: e.toolUses, durationMs: e.durationMs }
            : t,
        ),
      }
    }
    case 'task-done':
      if (!s.tasks.some((t) => t.id === e.id)) return s
      return { ...s, tasks: s.tasks.map((t) => (t.id === e.id ? { ...t, status: e.status, summary: e.summary } : t)) }
```

Rode a suíte inteira: testes que comparam `initialChat`/`ChatState` literais (ex. `agentStore.test.ts`, `restartSession.test.ts`) podem precisar de `tasks: []`.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src test
git commit -m "feat: track background tasks (task_started/progress/notification) per chat

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Barra de tarefas, parar e Ctrl+B

**Files:**
- Modify: `src/main/agent/AgentSession.ts` (`stopTask`, `backgroundTasks`)
- Modify: `src/shared/ipc-contract.ts` (`agent:stopTask`, `agent:background`)
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/main/agent/fakeQuery.ts` (cenário "tarefa")
- Create: `src/renderer/src/panels/agent/TasksBar.tsx`
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`
- Modify: `src/renderer/src/panels/agent/Composer.tsx` (Ctrl+B)
- Modify: `src/renderer/src/agent/composerKeys.ts` (`isBackgroundKey`)
- Test: `test/main/AgentSession.test.ts`, `test/main/fakeQuery.test.ts`, `test/renderer/composerKeys.test.ts`, `e2e/agent-tasks.spec.ts`

**Interfaces:**
- Consumes: `ChatState.tasks`, `TaskInfo` (Task 3); `notify` (4A).
- Produces:
  - `QueryLike.stopTask?(taskId: string): Promise<void>`; `QueryLike.backgroundTasks?(toolUseId?: string): Promise<boolean>`
  - `AgentSession.stopTask(taskId: string): Promise<Outcome<null>>`; `AgentSession.backgroundTasks(): Promise<Outcome<boolean>>` (sem query iniciada → `{ ok: true, value: false }`)
  - IPC `'agent:stopTask': { args: [panelId: string, taskId: string]; result: Outcome<null> }`, `'agent:background': { args: [panelId: string]; result: Outcome<boolean> }`
  - `isBackgroundKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean` (Ctrl+B sem Cmd/Alt)
  - `TasksBar({ panelId, tasks })` com `data-testid="tasks-bar"`, botão por tarefa `aria-label="Parar tarefa <descrição>"`

- [ ] **Step 1: Write the failing tests**

`test/main/AgentSession.test.ts`:

```ts
  describe('background tasks', () => {
    it('stops a task and backgrounds the running ones', async () => {
      const f = fake()
      const stop = vi.fn(async () => undefined)
      const bg = vi.fn(async () => true)
      f.q.stopTask = stop
      f.q.backgroundTasks = bg
      const { s } = session(f.fn)
      await expect(s.backgroundTasks()).resolves.toEqual({ ok: true, value: false })
      expect(bg).not.toHaveBeenCalled()
      s.start()
      await expect(s.stopTask('t1')).resolves.toEqual({ ok: true, value: null })
      expect(stop).toHaveBeenCalledWith('t1')
      await expect(s.backgroundTasks()).resolves.toEqual({ ok: true, value: true })
    })

    it('degrades when unsupported, failing or closed', async () => {
      const f = fake()
      const { s } = session(f.fn)
      s.start()
      await expect(s.stopTask('t1')).resolves.toMatchObject({ ok: false, message: expect.stringContaining('não é suportado') })
      f.q.backgroundTasks = async () => {
        throw new Error('Background tasks are disabled')
      }
      await expect(s.backgroundTasks()).resolves.toEqual({ ok: false, message: 'Background tasks are disabled' })
      s.close()
      await expect(s.stopTask('t1')).resolves.toEqual({ ok: false, message: 'Sessão encerrada.' })
    })
  })
```

`test/renderer/composerKeys.test.ts`:

```ts
describe('isBackgroundKey', () => {
  it('is Ctrl+B only', () => {
    expect(isBackgroundKey({ key: 'b', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(isBackgroundKey({ key: 'B', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(isBackgroundKey({ key: 'b', ctrlKey: false, metaKey: true, altKey: false })).toBe(false)
    expect(isBackgroundKey({ key: 'b', ctrlKey: true, metaKey: true, altKey: false })).toBe(false)
    expect(isBackgroundKey({ key: 'x', ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
  })
})
```

`test/main/fakeQuery.test.ts` — novo `it` seguindo o padrão do arquivo para rodar uma query e coletar mensagens: enviar `'rode uma tarefa'`, esperar um `system`/`task_started` com `task_id: 'fake_task_bg_1'`, chamar `q.stopTask!('fake_task_bg_1')` e esperar um `system`/`task_notification` com `status: 'stopped'`; `await expect(q.backgroundTasks!()).resolves.toBe(true)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/main/AgentSession.test.ts test/renderer/composerKeys.test.ts test/main/fakeQuery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Main**

`src/main/agent/AgentSession.ts` — `QueryLike` ganha os dois métodos opcionais; métodos após `rewindFiles`:

```ts
  /** Stops a background task (the CLI then emits task_notification 'stopped'). */
  async stopTask(taskId: string): Promise<Outcome<null>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    const query = this.query
    if (!query?.stopTask) return unsupported('Parar tarefa')
    try {
      await query.stopTask(taskId)
      return { ok: true, value: null }
    } catch (err) {
      return failure(err)
    }
  }

  /** The CLI's Ctrl+B: moves the foreground Bash commands/subagents of the running turn to the background. */
  async backgroundTasks(): Promise<Outcome<boolean>> {
    if (this.closed) return { ok: false, message: 'Sessão encerrada.' }
    const query = this.query
    if (!query) return { ok: true, value: false }
    if (!query.backgroundTasks) return unsupported('Ctrl+B')
    try {
      return { ok: true, value: await query.backgroundTasks() }
    } catch (err) {
      return failure(err)
    }
  }
```

(nenhum dos dois chama `start()`: sem query não há tarefa.)

`src/shared/ipc-contract.ts` — os dois canais + `INVOKE_CHANNELS`. `src/main/ipc/handlers.ts`:

```ts
    'agent:stopTask': (panelId, taskId) => d.agents.get(panelId).stopTask(taskId),
    'agent:background': (panelId) => d.agents.get(panelId).backgroundTasks(),
```

`src/main/agent/fakeQuery.ts` — no loop de mensagens, antes da resposta de texto:

```ts
      if (text.includes('tarefa')) {
        const taskId = `fake_task_bg_${turn}`
        out.push({ type: 'system', subtype: 'task_started', task_id: taskId, tool_use_id: `fake_bg_tool_${turn}`, description: 'npm run build', task_type: 'local_bash', session_id: 'fake', uuid: `u_${taskId}` })
        out.push({ type: 'system', subtype: 'task_progress', task_id: taskId, description: 'npm run build', last_tool_name: 'Bash', usage: { total_tokens: 0, tool_uses: 1, duration_ms: 1200 }, session_id: 'fake', uuid: `p_${taskId}` })
        runningTasks.add(taskId)
      }
```

com `const runningTasks = new Set<string>()` no escopo da query, e no `Object.assign`:

```ts
    stopTask: async (taskId: string) => {
      if (!runningTasks.delete(taskId)) return
      out.push({ type: 'system', subtype: 'task_notification', task_id: taskId, status: 'stopped', summary: 'Parada pelo usuário', output_file: '', session_id: 'fake', uuid: `n_${taskId}` })
    },
    backgroundTasks: async () => true,
```

- [ ] **Step 4: Renderer**

`src/renderer/src/agent/composerKeys.ts`:

```ts
/** Ctrl+B (the CLI's "run in background"); Cmd+B is left to the app. */
export function isBackgroundKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'b'
}
```

Create `src/renderer/src/panels/agent/TasksBar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { TaskInfo } from '@shared/agent'
import { useAgents } from '../../stores/agentStore'

const FINISHED_VISIBLE_MS = 4000
const secs = (ms?: number) => (ms ? `${Math.round(ms / 1000)}s` : '')
const STATUS: Record<Exclude<TaskInfo['status'], 'running'>, string> = { completed: 'concluída', failed: 'falhou', stopped: 'parada' }

/** Background Bash commands / subagents of this panel; finished ones linger briefly, then disappear. */
export function TasksBar({ panelId, tasks }: { panelId: string; tasks: TaskInfo[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const finishedIds = tasks.filter((t) => t.status !== 'running').map((t) => t.id).join('|')
  useEffect(() => {
    const ids = finishedIds ? finishedIds.split('|') : []
    const timers = ids.filter((id) => !hidden.has(id)).map((id) => setTimeout(() => setHidden((h) => new Set(h).add(id)), FINISHED_VISIBLE_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedIds])
  const visible = tasks.filter((t) => !hidden.has(t.id))
  if (visible.length === 0) return null
  const stop = (t: TaskInfo) =>
    void window.api
      .invoke('agent:stopTask', panelId, t.id)
      .then((r) => !r.ok && useAgents.getState().setNotice(panelId, { text: r.message, command: '' }))
      .catch((err) => useAgents.getState().setNotice(panelId, { text: err instanceof Error ? err.message : String(err), command: '' }))
  return (
    <div data-testid="tasks-bar" className="mx-2 mb-1 space-y-0.5 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs">
      {visible.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <span className={t.status === 'running' ? 'text-sky-400' : 'text-neutral-500'}>{t.status === 'running' ? '●' : '○'}</span>
          <span className="flex-1 truncate text-neutral-300">{t.description}</span>
          {t.lastToolName && t.status === 'running' && <span className="text-neutral-500">{t.lastToolName}</span>}
          <span className="text-neutral-500">{t.status === 'running' ? secs(t.durationMs) : STATUS[t.status]}</span>
          {t.status === 'running' && (
            <button aria-label={`Parar tarefa ${t.description}`} className="rounded px-1 text-neutral-400 hover:bg-neutral-800" onClick={() => stop(t)}>
              ■
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

`AgentPanel.tsx` — logo antes do `{btw && <BtwCard ... />}`:

```tsx
      <TasksBar panelId={panelId} tasks={chat.tasks} />
```

e `onBackground`:

```ts
  const background = () =>
    void window.api
      .invoke('agent:background', panelId)
      .then((r) => {
        if (!r.ok) notify(r.message)
      })
      .catch((err) => notify(errorText(err)))
```

passado ao `Composer` como `onBackground={background}`.

`Composer.tsx` — prop `onBackground(): void`; no `onKeyDown`, antes do bloco de Esc Esc:

```ts
          if (isBackgroundKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey })) {
            if (busy) {
              e.preventDefault()
              onBackground()
            }
            return
          }
```

(Ctrl+B com o agente parado não faz nada — Review Focus #5.)

- [ ] **Step 5: E2E**

Create `e2e/agent-tasks.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('barra de tarefas mostra a tarefa em segundo plano e para ela', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('rode uma tarefa')
  await input.press('Enter')
  const bar = page.getByTestId('tasks-bar')
  await expect(bar).toContainText('npm run build')
  await expect(bar).toContainText('Bash')
  await page.getByRole('button', { name: 'Parar tarefa npm run build' }).click()
  await expect(bar).toContainText('parada')
  await expect(bar).toHaveCount(0, { timeout: 8000 })

  // Ctrl+B with the agent idle does nothing (no notice, no error).
  await input.press('Control+b')
  await expect(page.getByTestId('composer-notice')).toHaveCount(0)
  await app.close()
})
```

- [ ] **Step 6: Run everything touched**

Run: `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test e2e/agent-tasks.spec.ts e2e/agent.spec.ts e2e/agent-btw.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src test e2e/agent-tasks.spec.ts
git commit -m "feat: background tasks bar with stop, and Ctrl+B to background the running turn

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verificação final do 4B

- [ ] **Step 1:** `npm run typecheck && npx vitest run && npx electron-vite build && npx playwright test` — tudo verde (instáveis conhecidos: rodar isolados).
- [ ] **Step 2: Smoke real** (script fora do repo, `claude` real, haiku, pasta temporária): pedir "rode `sleep 30 && echo fim` em segundo plano com a ferramenta Bash (run_in_background)"; confirmar `task_started` no stream; `stopTask(id)` → `task_notification` `stopped`; `forkSession(sid, { dir, title: 'smoke-fork' })` → `listSessions` mostra `smoke-fork`. Registrar no ledger.
- [ ] **Step 3: Manual** — notificação ao terminar com o app em segundo plano; clique foca o painel; menu desliga.
