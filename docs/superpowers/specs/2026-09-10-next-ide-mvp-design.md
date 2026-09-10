# next-ide — MVP (Fase 1) — Design

Data: 2026-09-10
Status: aprovado em conversa, aguardando revisão da spec escrita

## 1. Objetivo

IDE desktop pessoal focada em trabalhar com agentes de IA em vários projetos ao mesmo tempo.
Combina o que funciona no VS Code (sidebar com vários projetos do workspace, input nativo da
extensão Claude Code) com o que funciona no cmux (grid de sessões lado a lado, status por sessão),
resolvendo o que falta nos dois: **ver todas as sessões ativas — de um ou vários projetos — numa
única tela, sem nunca perder o input nativo**.

Uso pessoal, local, macOS. Não é produto distribuído.

## 2. Roadmap e escopo

| Fase | Conteúdo |
|------|----------|
| **1 — MVP (esta spec)** | Shell Electron, sidebar de workspaces + árvore de arquivos, grid docking, painel Agente (Claude) com chat próprio, painel Terminal (zsh), painel FileViewer, statusline, `/resume`, seletor de modelo, diff visual, colar imagem, restaurar ao reabrir |
| 2 — Status avançado | Notificações do SO ao terminar turno, detecção de portas abertas por projeto, indicadores extras |
| 3 — Multi-agente | Adaptadores Codex e Gemini atrás da interface `AgentAdapter` |
| 4 — Arquivos++ | Edição de arquivos, busca de conteúdo (grep) |
| 5 — Boards | Múltiplos layouts salvos trocáveis |

Fora do escopo da Fase 1: edição de arquivos, Codex/Gemini, notificações do SO, detecção de
portas, múltiplos boards, restauração de scrollback de terminal, distribuição/assinatura do app.

## 3. Decisões já tomadas

1. **Painel de agente é chat próprio** (estilo extensão VS Code), não TUI em terminal.
2. **Motor: Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, verificado v0.3.267) no main
   process, apontando para o binário `claude` já instalado via `pathToClaudeCodeExecutable`.
   Herda login da assinatura, skills, hooks, MCPs, `CLAUDE.md` e settings do usuário.
   - Verificado empiricamente: `claude -p --output-format stream-json` roda sem
     `ANTHROPIC_API_KEY` (`apiKeySource: "none"`), usando o login existente.
   - Restrição: se o app um dia for distribuído a terceiros, a política da Anthropic exige
     API key própria de cada usuário. Para uso pessoal, login existente é suficiente.
3. **Grid: docking com abas** (`dockview-react`).
4. **Dois tipos de painel de sessão**: Agente e Terminal (zsh). Mais FileViewer.
5. **Sidebar baseada em workspaces nomeados**, com importação de `.code-workspace`.
6. **Statusline nativa configurável** + segmento opcional que executa o script `statusLine`
   do `~/.claude/settings.json` do usuário.

## 4. Stack

| Camada | Escolha |
|--------|---------|
| Build | `electron-vite` 5 + TypeScript |
| Runtime | Electron 44 |
| UI | React + Tailwind CSS |
| Estado (renderer) | `zustand`, um store por domínio |
| Docking | `dockview-react` 8 |
| Terminal | `node-pty` 1.1 + `@xterm/xterm` 6 (addons fit, web-links, search) |
| Highlight | `shiki` 4 |
| Diff | `react-diff-view` 3 (+ lib `diff` para gerar hunks) |
| Agente | `@anthropic-ai/claude-agent-sdk` |
| Testes | Vitest, Playwright (`_electron`) |

Versões confirmadas via `npm view` em 2026-09-10; fixar no `package.json` na implementação.

## 5. Arquitetura

```
┌─ Main process (Node) ─────────────────────────────┐
│ WorkspaceStore   → workspaces.json                │
│ SettingsStore    → settings.json                  │
│ LayoutStore      → layout.json                    │
│ AgentManager     → Map<panelId, AgentSession>     │
│   AgentSession   → SDK query(), fila de input,    │
│                    permissões pendentes, stats    │
│ PtyManager       → Map<panelId, IPty>             │
│ FsService        → listar/ler, watch, gitignore   │
│ GitService       → branch, status porcelain       │
└──────────── IPC tipado (preload + contextBridge) ─┘
┌─ Renderer (React + Tailwind) ─────────────────────┐
│ Sidebar: sessões ativas, workspaces, árvore       │
│ Dock (dockview): AgentPanel | TerminalPanel |     │
│                  FilePanel                        │
│ AgentPanel: ChatView + Composer + StatusLine      │
└───────────────────────────────────────────────────┘
```

Segurança do renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
Todo acesso a disco, processo e rede fica no main. O preload expõe só a API do contrato IPC.

### 5.1 Estrutura de pastas

```
src/
  main/
    agent/      AgentManager, AgentSession, normalize.ts (SDK → AgentEvent)
    pty/        PtyManager
    fs/         FsService, gitignore
    git/        GitService
    store/      WorkspaceStore, SettingsStore, LayoutStore
    ipc/        registro dos handlers
  preload/      index.ts (contextBridge)
  renderer/
    sidebar/
    dock/
    panels/agent/     ChatView, Composer, cards/, StatusLine
    panels/terminal/
    panels/file/
    statusline/
    stores/
  shared/
    ipc-contract.ts   tipos de canais invoke/event
    agent-events.ts   union AgentEvent
    models.ts         Workspace, Project, PanelParams, Settings
```

### 5.2 Modelo de dados

```ts
type Workspace = { id: string; name: string; projects: Project[]; collapsed: boolean };
type Project   = { id: string; name: string; path: string };   // path absoluto
type PanelParams =
  | { type: 'agent';    projectPath: string; sessionId?: string; model?: string; permissionMode?: PermissionMode }
  | { type: 'terminal'; projectPath: string }
  | { type: 'file';     projectPath: string; filePath: string; line?: number };
type Settings = {
  claudePath?: string;               // override do binário
  defaultModel?: string;
  defaultPermissionMode: PermissionMode;
  statusline: { segments: StatusSegmentId[]; customScript: boolean };
  theme: 'dark' | 'light' | 'system';
};
```

Cor do projeto: hash estável do `path` → uma cor de uma paleta fixa de ~12 tons.

## 6. Painel Agente

### 6.1 Ciclo de vida

- `AgentSession` cria um `query()` com `prompt` = `AsyncIterable<SDKUserMessage>` (streaming
  input), `cwd` = projeto, `includePartialMessages: true`, `canUseTool`, `permissionMode`,
  `model`, `resume?`, `pathToClaudeCodeExecutable`.
- Estados: `starting → idle → running → awaiting_permission → idle`, mais `error` e `closed`.
- Painel restaurado não sobe processo: mostra histórico e só cria `query({ resume })` no
  primeiro envio.

### 6.2 ChatView

Renderiza `AgentEvent`s em ordem, com auto-scroll que para quando o usuário rola para cima.

| Conteúdo | Render |
|----------|--------|
| Mensagem do usuário | Texto + miniaturas de imagens |
| Texto do assistente | Markdown com streaming (deltas) |
| Thinking | Bloco recolhível, recolhido por padrão |
| Read / Grep / Glob / LS | Uma linha recolhida com ✓/✗; expandir mostra resultado |
| Bash | Comando + saída (monoespaçada, ANSI básico), recolhível |
| Edit / Write / MultiEdit | Diff visual (antes/depois) com caminho clicável |
| TodoWrite | Checklist |
| Task (subagente) | Grupo recolhível com eventos filhos via `parent_tool_use_id` |
| Permissão pendente | Cartão inline: Permitir / Sempre / Negar |
| Erro | Cartão vermelho com mensagem; sessão segue usável se possível |

Caminhos de arquivo em cartões abrem FilePanel na linha correspondente.

### 6.3 Composer

- `<textarea>` auto-redimensionável (até ~40% da altura do painel, depois rola).
- `Enter` envia; `Shift+Enter` quebra linha. Colar multilinha é seguro por construção: o
  conteúdo vai como mensagem JSON, nunca como teclas.
- Colar ou arrastar imagem → miniatura removível → enviada como bloco `image` base64.
  Limite: png/jpg/gif/webp, até 5 MB por imagem.
- Envio com agente em `running` → mensagem enfileirada no iterável; visual "na fila".
- `Esc` ou botão ■ → `interrupt()`.
- `↑` com input vazio → última mensagem enviada.
- `@` → autocomplete de arquivos do projeto (mesma fonte do Cmd+P).
- Barra inferior: anexar imagem, `/`, dropdown de modelo (`supportedModels()` → `setModel()`),
  dropdown de modo (`default | acceptEdits | plan | auto | bypassPermissions` →
  `setPermissionMode()`), botão enviar/parar.

### 6.4 Comandos `/`

Autocomplete une duas fontes:

1. `supportedCommands()` do SDK (skills, comandos custom, `/compact` etc.) — enviados como texto.
2. Comandos locais da UI:
   - `/resume` → modal com `listSessions({ dir: cwd })` (título/resumo, data). Escolher encerra
     a sessão atual do painel, carrega histórico via `getSessionMessages()` e recria com
     `resume: id`.
   - `/clear` → encerra sessão atual e começa nova no mesmo painel.
   - `/model` → foca dropdown de modelo.
   - `/statusline` → abre configuração da statusline.

Comandos só da TUI (`/login`, `/mcp`, `/config`, `/usage` etc.) → aviso com botão
"abrir em terminal" que cria TerminalPanel no mesmo `cwd` rodando `claude`.

### 6.5 Permissões

- `canUseTool(toolName, input, { signal, suggestions })` cria uma Promise pendente guardada na
  sessão e emite `permission-request`. Estado vira `awaiting_permission`.
- Resposta do usuário → `{ behavior: 'allow', updatedInput }` ou `{ behavior: 'deny', message }`.
  "Sempre" devolve `suggestions` como `updatedPermissions`.
- `signal` abortado → cartão marcado como cancelado.
- Fechar painel com permissão pendente → nega, depois interrompe.

### 6.6 StatusLine

Segmentos disponíveis (liga/desliga/reordena em `/statusline`):

| Segmento | Fonte |
|----------|-------|
| projeto | `Project.name` |
| branch | `GitService` (atualiza em watch de `.git/HEAD`) |
| modelo | `init.model` / `setModel` |
| contexto % | `getContextUsage()` após cada turno; fallback `usage` ÷ `modelUsage.contextWindow` |
| tokens | `result.usage` acumulado |
| custo | `result.total_cost_usd` acumulado na sessão |
| duração | `result.duration_ms` do último turno |
| modo | modo de permissão atual |
| estado | estado da sessão |
| script custom | executa `statusLine.command` do `~/.claude/settings.json` com JSON no stdin (mesmo formato do Claude Code), renderiza ANSI; timeout 2 s; roda após cada turno |

## 7. Sidebar

- Filtro no topo: filtra nomes de projetos; com projeto expandido, filtra arquivos (fuzzy).
- **Sessões ativas**: lista de todas as sessões (agente e terminal) de todos os projetos, com
  estado; clicar foca o painel.
- **Workspaces**: criar, renomear, remover, reordenar (drag), colapsar. Adicionar pasta via
  diálogo nativo. Importar `.code-workspace` (lê `folders[].path`, resolve relativos ao arquivo).
- **Linha do projeto**: nome, branch, contagem de sessões, botões ▶ (novo Agente) e ⌨ (novo
  Terminal), abertos no grupo ativo do dock.
- **Árvore**: lazy por diretório; oculta `.git`, `node_modules` e padrões do `.gitignore`;
  cores de `git status --porcelain` (M/U/A/D); atualiza via `fs.watch` recursivo (debounce).
- `Cmd+P`: busca rápida fuzzy de arquivos em todos os projetos (índice construído sob demanda
  por projeto, respeitando gitignore).

## 8. Dock

- Painel novo vira aba no grupo ativo. Arrastar aba para borda de outro grupo divide; para o
  centro, junta abas.
- Aba: "projeto · tipo" (ou nome do arquivo), badge de estado, borda na cor do projeto.
- Atalhos: `Cmd+\` dividir direita, `Cmd+Shift+\` dividir abaixo, `Cmd+W` fechar (confirma se
  agente em `running`), `Cmd+1..9` focar grupo, duplo clique na aba maximiza/restaura.

## 9. Painel Terminal

- `node-pty.spawn(process.env.SHELL ?? '/bin/zsh', ['-l'], { cwd, cols, rows, env })`.
- xterm com addons fit (resize → `pty.resize`), web-links, search (`Cmd+F`).
- Saída agrupada em janelas de ~16 ms antes de enviar ao renderer.
- Processo morto ao fechar painel. Processo que sai sozinho → mensagem "processo encerrado"
  + botão reiniciar.

## 10. Painel FileViewer

- Somente leitura. `shiki` com tema do app, numeração de linhas, rolagem até `line`.
- Imagens (png/jpg/gif/webp/svg) → preview.
- Binário ou > 2 MB → aviso, sem render.
- Botão "Mencionar no agente": insere `@caminho` no composer do agente ativo do mesmo projeto;
  com linhas selecionadas, `@caminho#L10-20`. Sem agente ativo no projeto → abre um novo.
- Atualiza quando o arquivo muda em disco.

## 11. IPC

Contrato único em `src/shared/ipc-contract.ts`, usado por main, preload e renderer.

**Invoke (request/response)**

- `agent:create(panelId, params)`, `agent:send(panelId, { text, images })`,
  `agent:interrupt`, `agent:setModel`, `agent:setMode`,
  `agent:respondPermission(panelId, requestId, decision)`, `agent:listSessions(projectPath)`,
  `agent:loadHistory(projectPath, sessionId)`, `agent:commands(panelId)`,
  `agent:models(panelId)`, `agent:close(panelId)`
- `pty:create`, `pty:write`, `pty:resize`, `pty:kill`
- `fs:list(dir)`, `fs:read(path)`, `fs:index(projectPath)`, `fs:pickFolder`, `fs:pickWorkspaceFile`
- `git:info(projectPath)`
- `workspace:get/save`, `layout:get/save`, `settings:get/save`

**Eventos (main → renderer)**

- `agent:event(panelId, AgentEvent)`, `pty:data(panelId, chunk)`, `pty:exit(panelId, code)`,
  `fs:changed(projectPath, paths)`, `git:changed(projectPath)`

**`AgentEvent`** (normalizado; renderer nunca importa tipos do SDK):

```ts
type AgentEvent =
  | { kind: 'status'; state: SessionState }
  | { kind: 'init'; sessionId: string; model: string; cwd: string }
  | { kind: 'text-delta'; messageId: string; text: string }
  | { kind: 'thinking-delta'; messageId: string; text: string }
  | { kind: 'message'; role: 'user' | 'assistant'; id: string; blocks: Block[]; parentToolUseId?: string }
  | { kind: 'tool-start'; id: string; name: string; input: unknown; parentToolUseId?: string }
  | { kind: 'tool-result'; id: string; output: unknown; isError: boolean }
  | { kind: 'permission-request'; requestId: string; toolName: string; input: unknown; hasSuggestions: boolean }
  | { kind: 'permission-resolved'; requestId: string; decision: 'allow' | 'allow-always' | 'deny' | 'cancelled' }
  | { kind: 'stats'; usage: Usage; costUsd: number; durationMs: number; contextPct?: number }
  | { kind: 'error'; message: string; recoverable: boolean };
```

`AgentSession` implementa `AgentAdapter` (create/send/interrupt/setModel/setMode/
respondPermission/close + stream de `AgentEvent`), preparando Fase 3.

Deltas de texto também agrupados em ~16 ms.

## 12. Persistência

Local: `app.getPath('userData')` (`~/Library/Application Support/next-ide/`).

- `workspaces.json`, `layout.json` (dockview `toJSON()` + `PanelParams` por painel),
  `settings.json`.
- Escrita atômica (arquivo temporário + rename), debounce 500 ms, flush em `before-quit`.
- Restauração:
  - Layout reconstruído com `fromJSON()`.
  - Agente: histórico via `getSessionMessages()`; processo só no primeiro envio
    (`resume: sessionId`). Sessão inexistente → painel oferece "iniciar nova".
  - Terminal: shell novo no mesmo `cwd` (scrollback não restaurado).
  - Arquivo: reaberto; se não existe mais, aviso.
- JSON corrompido → backup `*.corrupt-<timestamp>.json` e começa com padrão.

## 13. Tratamento de erros

| Situação | Comportamento |
|----------|---------------|
| Binário `claude` não encontrado | Tela de onboarding pedindo caminho (`Settings.claudePath`) |
| Não autenticado | Cartão com botão "abrir terminal com `claude /login`" |
| Subprocesso do agente morre | Estado `error`, botão "retomar" (mesmo `sessionId`) |
| Erro de API / rate limit (`result.is_error`) | Cartão de erro; sessão segue usável |
| Fechar painel com permissão pendente | Nega, depois interrompe e fecha |
| Sair do app com agentes em `running` | Diálogo de confirmação |
| Pasta de projeto removida/sem acesso | Projeto marcado "não encontrado"; sidebar segue funcionando |
| Script de statusline falha/timeout | Segmento mostra "—"; erro no log |

## 14. Testes

- **Unitários (Vitest)**: `normalize.ts` com fixtures gravadas de stream-json real
  (`test/fixtures/*.jsonl`); lógica do composer (fila, histórico ↑, parsing `/` e `@`);
  serialização/restauração de `PanelParams`; `WorkspaceStore` (incl. import `.code-workspace`);
  filtro gitignore; hash de cor de projeto.
- **Integração**: `AgentSession` com função `query` injetada (fake que emite eventos gravados e
  chama `canUseTool`) — cobre estados, fila, permissões, interrupt, erro. Nenhum teste chama
  Claude real.
- **E2E (Playwright `_electron`)**: abrir app, criar workspace, adicionar pasta, abrir terminal,
  dividir painel, fechar e reabrir → layout restaurado. Agente em E2E usa o fake via variável de
  ambiente `NEXT_IDE_FAKE_AGENT=1`.
- **Manual**: sessão Claude real — enviar texto multilinha, colar imagem, aprovar/negar
  permissão, `/resume`, trocar modelo, reabrir app.

## 15. Critérios de sucesso do MVP

1. Com 2+ projetos de workspaces diferentes, abrir agentes Claude em cada um e vê-los lado a
   lado, junto de terminais zsh, numa única janela.
2. Colar bloco multilinha no composer nunca envia antes do `Enter`.
3. Permissões aparecem inline e bloqueiam só aquela sessão.
4. `/resume` lista e retoma sessões anteriores do projeto com histórico visível.
5. Fechar e reabrir o app restaura layout e sessões.
6. Statusline mostra modelo, contexto %, custo e branch corretos.
