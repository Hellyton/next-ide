# next-ide — Paridade com o Claude Code CLI — Design

Data: 2026-09-25
Status: escopo e ordem aprovados em conversa; aguardando revisão da spec escrita

## 1. Objetivo

Trazer para o painel do agente os recursos do Claude Code CLI que o usuário usa no dia a dia e que o
next-ide ainda não expõe, para não precisar voltar ao terminal. Tudo roda sobre o Claude Agent SDK
(0.3.268) já usado pelo `AgentSession`, apontando para o binário `claude` do usuário.

Já existe e não entra aqui: `/btw` (commit 9d478e0), mensagens durante o turno (fila), `/compact` e
demais comandos repassados, `/resume`, `/clear`, `/model`, `/statusline`, permissões.

Já carregado pelo CLI via `settingSources: ['user','project','local']` (hooks, MCP, subagentes,
skills do usuário): esta spec só adiciona **visão e controle** na UI, não recarrega nada disso.

### Critérios de sucesso

- Cada recurso funciona com o `claude` real (smoke manual) e com o `fakeQuery` (e2e).
- Comandos com o mesmo nome do CLI fazem o mesmo que no CLI.
- Métodos do SDK ausentes (binário antigo) degradam para um aviso, nunca quebram o painel.
- Suíte verde: vitest + e2e.

### Fatos verificados (spike 2026-09-25, haiku, binário 2.1.282)

- `uuid` informado no `SDKUserMessage` é preservado no transcript → o id do evento `user` do
  next-ide pode ser o id do checkpoint.
- `enableFileCheckpointing: true` + `rewindFiles(uuid, { dryRun })` devolve arquivos/linhas;
  sem `dryRun` restaura o arquivo.
- `getContextUsage()` devolve categorias, total, máximo e arquivos de memória.
- `supportedAgents()`, `mcpServerStatus()` e `applyFlagSettings({ effortLevel })` funcionam.
- `backgroundTasks()` NÃO lista tarefas: manda a tarefa atual para segundo plano (Ctrl+B do CLI).
  A lista vem das mensagens `system` `task_started` / `task_progress` / `task_notification`.

## 2. Divisão em três planos

| Plano | Tema | Recursos |
|---|---|---|
| 4A | Segurança e contexto | checkpoints + `/rewind`, `/context`, esforço (`/effort`), `/rename` |
| 4B | Várias sessões | notificações do macOS, `/fork`, tarefas em segundo plano (lista, parar, Ctrl+B) |
| 4C | Configuração | `/mcp`, subagentes (`/agents` + `@agent-`), `/add-dir` |

Cada plano é um branch/merge próprio, com suíte verde antes do próximo. Ordem: 4A → 4B → 4C.

## 3. Arquitetura comum

Mesmo padrão do `/btw`:

- **Main** — `QueryLike` ganha os métodos novos como opcionais; `AgentSession` expõe um método por
  recurso que chama o SDK e devolve um resultado tipado (`{ ok: false, message }` quando o método
  não existe ou falha). `AgentManager`/handlers só repassam.
- **Contrato IPC** — um canal `agent:<recurso>` por operação em `ipc-contract.ts`
  (`INVOKE_CHANNELS` + guarda de compilação já existentes).
- **Eventos** — o que chega pelo stream vira `AgentEvent` no `StreamNormalizer` e é tratado pelo
  `chatReducer` (tarefas).
- **Renderer** — comandos locais novos em `slash.ts` (`LOCAL_COMMANDS`, e `classifySlash` passa a
  aceitar argumento quando o comando pedir). `TUI_ONLY` perde `mcp` e `agents`. Modais seguem o
  `ResumeModal`; controles do rodapé seguem `ModelSelect`/`ModeSelect`.
- **fakeQuery** — ganha cada método com resposta determinística, para os e2e.

Opções fixas novas no `start()` do `AgentSession`: `enableFileCheckpointing: true`, `effort`
(quando definido), `additionalDirectories` (quando houver).

`AgentPanelParams` ganha campos opcionais persistidos no layout: `effort?: EffortLevel`,
`additionalDirectories?: string[]`.

## 4. Plano 4A — Segurança e contexto

### 4.1 Checkpoints + `/rewind`

- `send()` passa `uuid` = id do evento `user` na mensagem enviada ao SDK. Histórico retomado já usa o
  `uuid` do transcript como id. Assim todo balão de usuário tem o id do checkpoint.
- `/rewind` (e Esc Esc com o composer vazio e o agente parado, como no CLI) abre o `RewindModal`:
  lista as mensagens do usuário da sessão, da mais recente para a mais antiga.
- Ao escolher uma mensagem, o modal chama `agent:rewindPreview` (`rewindFiles(uuid, { dryRun: true })`)
  e mostra arquivos e +/− linhas. Três ações, iguais às do CLI:
  1. **Código e conversa** — restaura arquivos e volta a conversa.
  2. **Só conversa** — volta a conversa, arquivos intactos.
  3. **Só código** — restaura arquivos, conversa intacta.
- Restaurar arquivos: `agent:rewindFiles` → `rewindFiles(uuid)`.
- Voltar a conversa: no main, lê o transcript (`getSessionMessages`), acha a entrada anterior à
  mensagem escolhida e chama `forkSession(sessionId, { upToMessageId })`. O painel reinicia pelo
  `restartSession` já existente com o novo `sessionId` e o histórico truncado; o texto da mensagem
  escolhida volta para o composer (comportamento do CLI). Mensagem escolhida = primeira da sessão →
  equivale a `/clear` com o texto no composer.
- Bloqueado enquanto o agente está rodando (aviso "pare o agente antes de voltar").
- Sem checkpoint para a mensagem (`canRewind: false`) → a opção de código fica desabilitada com o
  `error` do SDK; a de conversa continua.

### 4.2 `/context`

- `agent:contextUsage` → `getContextUsage()`.
- `ContextModal`: barra empilhada pelas categorias (cores do SDK), total/máximo/percentual,
  lista de categorias com tokens e lista de arquivos de memória (CLAUDE.md etc.) com tokens.
- Antes da primeira mensagem inicia a query (como `commands()`), para mostrar o custo base.

### 4.3 Esforço (`/effort`)

- `EffortSelect` no rodapé ao lado do modelo: `auto` (padrão do CLI, sem opção) · `low` · `medium`
  · `high` · `xhigh` · `max`.
- Com query rodando: `applyFlagSettings({ effortLevel })`; também guarda para a próxima query
  (opção `effort`). Persistido em `AgentPanelParams.effort`.
- `/effort` sem argumento foca o seletor; `/effort <nível>` aplica direto.

### 4.4 `/rename <título>`

- `agent:rename` → `renameSession(sessionId, título)` do SDK (aparece no `/resume` e no CLI).
- Sem sessão ainda (nenhuma mensagem enviada) → aviso "envie uma mensagem antes de renomear".
- O título também vira o nome da aba do painel.

## 5. Plano 4B — Várias sessões

### 5.1 Notificações do macOS

- No main, o `AgentManager` observa transições de estado já emitidas (`status`):
  `running → idle` = "terminou", `* → awaiting_permission` = "pede permissão",
  `* → error` = "erro".
- Dispara `Notification` do Electron só quando a janela não está em foco. Título
  `<projeto> · Claude`, corpo com o motivo; clique foca a janela e ativa o painel
  (evento `agent:focus` para o renderer).
- Liga/desliga em `Settings.notifications` (padrão ligado), com item no menu do app.
- Não usa hooks do SDK: o estado já é conhecido no main e evita depender de hooks do usuário.

### 5.2 `/fork`

- `agent:fork` → `forkSession(sessionId)` no main; abre um novo painel de agente no mesmo projeto
  com o `sessionId` novo, ao lado do atual (mesmo caminho do restore: histórico carregado, CLI só
  sobe no primeiro envio). Título opcional: `/fork <título>`.
- Sem sessão ainda → aviso.

### 5.3 Tarefas em segundo plano

- `StreamNormalizer` emite `task-started` / `task-progress` / `task-done` a partir das mensagens
  `task_*`. `chatReducer` mantém `tasks` por painel (descrição, tipo, última ferramenta, tokens,
  duração, status).
- `TasksBar` acima do composer quando há tarefas em andamento: uma linha por tarefa com botão
  parar (`agent:stopTask` → `stopTask(id)`). Concluídas somem após alguns segundos.
- Ctrl+B com agente rodando → `agent:background` → `backgroundTasks()`; o turno segue e a tarefa
  aparece na barra.
- O painel sai de `running` pelo fluxo atual; tarefas em segundo plano não o prendem em `running`.

## 6. Plano 4C — Configuração

### 6.1 `/mcp`

- `McpModal`: lista de `mcpServerStatus()` com nome, status (conectado / falhou / precisa login /
  pendente / desligado), escopo, erro.
- Ações por servidor: ligar/desligar (`toggleMcpServer`) e reconectar (`reconnectMcpServer`);
  a lista recarrega após cada ação.
- `needs-auth` mostra o botão "Abrir em terminal" já existente (`claude /mcp`), porque o login
  OAuth do MCP é interativo.

### 6.2 Subagentes

- `/agents` abre `AgentsModal` com `supportedAgents()` (nome, descrição, modelo), só leitura.
  Criar/editar subagente continua no CLI (botão "Abrir em terminal").
- Menção: digitar `@agent-` no composer mostra os subagentes no `MentionMenu` junto dos arquivos;
  escolher insere `@agent-<nome>`, que o CLI já interpreta.
- Lista buscada uma vez por painel e em cache no renderer.

### 6.3 `/add-dir <caminho>`

- Valida no main que o caminho existe e é pasta. Adiciona em `AgentPanelParams.additionalDirectories`.
- A opção `additionalDirectories` só vale no início da query: o `AgentSession` fecha a query atual
  (sem perder `sessionId`) e a próxima mensagem retoma com a lista nova. Bloqueado com agente rodando.
- `/add-dir` sem argumento abre o seletor de pasta nativo (`fs:pickFolder`).
- As pastas extras aparecem como chips removíveis acima do composer.

## 7. Erros

- Método ausente no SDK/binário → `{ ok: false, message: '<recurso> não é suportado por esta versão do Claude Code.' }`
  exibido no `composer-notice`.
- Falha do SDK → mensagem do erro no mesmo aviso; o painel continua utilizável.
- Operações que reiniciam a query (`/rewind` conversa, `/add-dir`) são recusadas com agente
  rodando ou pedindo permissão.

## 8. Testes

- Unitário (vitest): cada método novo do `AgentSession` (sucesso, ausente, erro); normalização
  `task_*`; reducer de tarefas; `classifySlash` com argumentos; truncamento do histórico no rewind;
  regras de notificação (foco/transição).
- E2E (Playwright + `fakeQuery`): um spec por recurso (`agent-rewind`, `agent-context`,
  `agent-effort`, `agent-rename`, `agent-fork`, `agent-tasks`, `agent-mcp`, `agent-agents`,
  `agent-add-dir`). Notificações: teste unitário + verificação manual.
- Smoke real no fim de cada plano com o `claude` do usuário.

## 9. Fora do escopo

- Criar/editar subagentes, hooks e servidores MCP pela UI (continua no CLI/arquivos).
- Login OAuth de MCP dentro do app.
- Outros CLIs (Codex/Gemini).
