# next-ide — Plano 1: Fundação (shell, sidebar, dock, terminal, persistência)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Electron funcional com sidebar de workspaces, grid docking (dockview) com painéis Terminal (zsh real) e placeholder de Agente, atalhos de dock e layout restaurado ao reabrir.

**Architecture:** Main process concentra disco/processos (stores JSON, PtyManager, git) e expõe um contrato IPC tipado único (`src/shared/ipc-contract.ts`) via preload com `contextBridge`. Renderer React usa `zustand` para estado e `dockview-react` para o grid. Lógica testável fica em funções puras (`src/shared`, helpers do renderer) cobertas por Vitest; fluxos de UI cobertos por Playwright `_electron`.

**Tech Stack:** Electron 44.3.0, electron-vite 5.0.0, Vite 7.3.6, React 19.3.0, Tailwind CSS 4.3.3, zustand 5.0.15, dockview-react 8.3.0, node-pty 1.1.0, @xterm/xterm 6.0.0, TypeScript 5.9.3, Vitest 5.0.0, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-10-next-ide-mvp-design.md`

**Divisão do MVP em planos** (cada um entrega software funcionando):
- **Plano 1 (este):** fundação — scaffold, stores, IPC, sidebar de workspaces, dock, painel Terminal, persistência de layout, atalhos.
- **Plano 2:** painel Agente — AgentSession (SDK), normalização de eventos, ChatView, Composer, permissões, `/` comandos, `/resume`, modelo/modo, diff, imagens, StatusLine.
- **Plano 3:** arquivos — FsService, árvore com gitignore/watch/git status, Cmd+P, FileViewer, "Mencionar no agente", watch de branch.

## Global Constraints

- macOS (darwin arm64), uso pessoal; nada de assinatura/distribuição.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer só fala com main via `window.api` (contrato em `src/shared/ipc-contract.ts`).
- Preload expõe apenas canais listados em `INVOKE_CHANNELS` / `EVENT_CHANNELS`.
- Versões exatas (`npm install -E`) conforme Tech Stack. `vite` fica em 7.x porque `electron-vite@5` exige `vite ^5 || ^6 || ^7`; por isso `@vitejs/plugin-react@5.2.0` (não 6.x, que exige vite 8).
- `node-pty` é a única dependência em `dependencies` (electron-vite externaliza `dependencies` no main). Todo o resto em `devDependencies` (renderer é bundlado).
- `node-pty@1.1.0` usa N-API e traz prebuild `darwin-arm64`: não precisa rebuild para Electron. Se aparecer erro `NODE_MODULE_VERSION`, rodar `npx @electron/rebuild -f -w node-pty`.
- Código de teste nunca importa `electron` nem `node-pty` diretamente (usar injeção).
- Dados do app em `app.getPath('userData')`; variável `NEXT_IDE_USER_DATA` sobrescreve (E2E).
- Variáveis só para E2E: `NEXT_IDE_E2E_PICK_FOLDER`, `NEXT_IDE_E2E_PICK_WORKSPACE` substituem diálogos nativos.
- Textos de UI em português (pt-BR). Código, identificadores e comentários em inglês.
- Todo commit termina com as linhas:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DsUojN9FpXJWNDWbykQTCs
  ```

## File Structure

```
package.json, tsconfig.json, electron.vite.config.ts, vitest.config.ts, playwright.config.ts, .gitignore
src/shared/
  models.ts            tipos de domínio + DEFAULT_SETTINGS
  projectColor.ts      cor estável por caminho de projeto
  workspaces.ts        funções puras de workspaces/projetos + filtro
  layout.ts            sanitizeLayout
  ipc-contract.ts      mapa de canais invoke/event, NextIdeApi
src/main/
  index.ts             bootstrap: janela, stores, pty, IPC, quit
  menu.ts              menu da aplicação (sem Cmd+W)
  store/JsonFile.ts    leitura/escrita JSON atômica + debounce + backup de corrupção
  store/stores.ts      instâncias de JsonFile para workspaces/settings/layout
  store/codeWorkspace.ts  parser de .code-workspace (JSONC)
  git/gitInfo.ts       branch atual
  pty/OutputBatcher.ts agrupador de saída (~16 ms)
  pty/PtyManager.ts    Map<panelId, pty>
  pty/spawnShell.ts    spawn real via node-pty
  ipc/handlers.ts      buildHandlers(deps)
  ipc/register.ts      registerHandlers(ipcMain, handlers)
src/preload/index.ts   contextBridge window.api
src/renderer/index.html
src/renderer/src/
  main.tsx, App.tsx, styles.css, env.d.ts
  stores/sessionsStore.ts   sessões abertas (agente/terminal) e estado
  stores/workspaceStore.ts  workspaces + persistência via IPC
  dock/panelOptions.ts      panelTitle, newPanelId, buildAddPanelOptions
  dock/stateStyle.ts        classe de cor por SessionState
  dock/dockStore.ts         DockviewApi + comandos (open/split/close/focus)
  dock/Dock.tsx             DockviewReact + registro de painéis
  dock/PanelTab.tsx         aba customizada
  dock/layoutPersistence.ts restore/save de layout
  dock/shortcuts.ts         matchShortcut (puro)
  dock/useDockShortcuts.ts  listener global de teclado
  panels/agent/AgentStubPanel.tsx
  panels/terminal/terminalRegistry.ts
  panels/terminal/TerminalPanel.tsx
  sidebar/Sidebar.tsx, WorkspaceSection.tsx, ProjectRow.tsx, ActiveSessions.tsx, useGitBranch.ts
test/  (Vitest, espelha src)
e2e/   (Playwright)
```

---

### Task 1: Scaffold Electron + React + Tailwind + Vitest + Playwright

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`
- Create: `e2e/helpers.ts`, `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `launch(opts?: { userData?: string; env?: Record<string, string> }): Promise<{ app: ElectronApplication; page: Page; userData: string }>` em `e2e/helpers.ts`; scripts npm `dev`, `build`, `typecheck`, `test`, `test:e2e`.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "next-ide",
  "version": "0.1.0",
  "private": true,
  "description": "Personal IDE for multi-project AI agent sessions",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:e2e": "electron-vite build && playwright test"
  }
}
```

- [ ] **Step 2: Instalar dependências**

```bash
npm install -E node-pty@1.1.0
npm install -D -E electron@44.3.0 electron-vite@5.0.0 vite@7.3.6 @vitejs/plugin-react@5.2.0 \
  typescript@5.9.3 @types/node@22.20.2 react@19.3.0 react-dom@19.3.0 @types/react@19.3.0 @types/react-dom@19 \
  tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 zustand@5.0.15 dockview-react@8.3.0 \
  @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0 @xterm/addon-web-links@0.12.0 \
  vitest@5.0.0 @playwright/test@1.63.0
```

Expected: instala sem erro de peer dependency. Se `npm` reclamar de peer do `vite`, conferir que `vite@7.3.6` foi aceito (não usar `--force`).

- [ ] **Step 3: Criar `.gitignore`**

```
node_modules/
out/
dist/
test-results/
playwright-report/
*.tmp
.DS_Store
```

- [ ] **Step 4: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["node"],
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@renderer/*": ["./src/renderer/src/*"]
    },
    "noEmit": true
  },
  "include": ["src", "test", "e2e", "electron.vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 5: Criar `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
  },
})
```

- [ ] **Step 6: Criar `vitest.config.ts` e `playwright.config.ts`**

```ts
// vitest.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') },
  },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({ testDir: 'e2e', timeout: 30_000, workers: 1, reporter: 'list' })
```

- [ ] **Step 7: Criar main e preload mínimos**

```ts
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

if (process.env.NEXT_IDE_USER_DATA) app.setPath('userData', process.env.NEXT_IDE_USER_DATA)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

```ts
// src/preload/index.ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 8: Criar renderer mínimo**

```html
<!-- src/renderer/index.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>next-ide</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/renderer/src/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

```tsx
// src/renderer/src/App.tsx
export function App() {
  return <div className="flex h-full items-center justify-center text-neutral-300">next-ide</div>
}
```

```css
/* src/renderer/src/styles.css */
@import 'tailwindcss';

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: #0a0a0a;
  color: #e5e5e5;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 9: Escrever o teste E2E de fumaça**

```ts
// e2e/helpers.ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function launch(
  opts: { userData?: string; env?: Record<string, string> } = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'next-ide-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...(process.env as Record<string, string>), NEXT_IDE_USER_DATA: userData, ...opts.env },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userData }
}
```

```ts
// e2e/smoke.spec.ts
import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app abre janela com título next-ide', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('next-ide')
  await expect(page.getByText('next-ide')).toBeVisible()
  await app.close()
})
```

- [ ] **Step 10: Rodar typecheck e E2E**

Run: `npm run typecheck && npm run test:e2e`
Expected: typecheck sem erros; `1 passed`.

- [ ] **Step 11: Conferir `npm run dev` manualmente**

Run: `npm run dev`
Expected: janela escura com "next-ide" no centro. Fechar com Cmd+Q.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite app with react, tailwind, vitest and playwright"
```

---

### Task 2: Modelos compartilhados e cor de projeto

**Files:**
- Create: `src/shared/models.ts`, `src/shared/projectColor.ts`
- Test: `test/shared/projectColor.test.ts`

**Interfaces:**
- Produces:
  - `Project`, `Workspace`, `PermissionMode`, `AgentPanelParams`, `TerminalPanelParams`, `FilePanelParams`, `PanelParams`, `PanelType`, `StatusSegmentId`, `Settings`, `DEFAULT_SETTINGS`, `LayoutState`, `GitInfo`, `SessionState` (em `@shared/models`)
  - `PROJECT_PALETTE: readonly string[]`, `projectColor(path: string): string` (em `@shared/projectColor`)

- [ ] **Step 1: Criar `src/shared/models.ts`**

```ts
export type Project = { id: string; name: string; path: string }

export type Workspace = { id: string; name: string; projects: Project[]; collapsed: boolean }

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk'

export type AgentPanelParams = {
  type: 'agent'
  projectPath: string
  sessionId?: string
  model?: string
  permissionMode?: PermissionMode
}
export type TerminalPanelParams = { type: 'terminal'; projectPath: string }
export type FilePanelParams = { type: 'file'; projectPath: string; filePath: string; line?: number }
export type PanelParams = AgentPanelParams | TerminalPanelParams | FilePanelParams
export type PanelType = PanelParams['type']

export type StatusSegmentId =
  | 'project'
  | 'branch'
  | 'model'
  | 'context'
  | 'tokens'
  | 'cost'
  | 'duration'
  | 'mode'
  | 'state'
  | 'customScript'

export type Settings = {
  claudePath?: string
  defaultModel?: string
  defaultPermissionMode: PermissionMode
  statusline: { segments: StatusSegmentId[]; customScript: boolean }
  theme: 'dark' | 'light' | 'system'
}

export const DEFAULT_SETTINGS: Settings = {
  defaultPermissionMode: 'default',
  statusline: {
    segments: ['project', 'branch', 'model', 'context', 'cost', 'duration', 'state'],
    customScript: false,
  },
  theme: 'dark',
}

/** `dock` is dockview's SerializedDockview; kept opaque outside the renderer. */
export type LayoutState = { version: 1; dock: unknown }

export type GitInfo = { branch: string | null }

export type SessionState = 'starting' | 'idle' | 'running' | 'awaiting_permission' | 'error' | 'exited'
```

- [ ] **Step 2: Escrever teste falhando de `projectColor`**

```ts
// test/shared/projectColor.test.ts
import { describe, expect, it } from 'vitest'
import { PROJECT_PALETTE, projectColor } from '@shared/projectColor'

describe('projectColor', () => {
  it('returns a palette color', () => {
    expect(PROJECT_PALETTE).toContain(projectColor('/Users/me/papersystem-api'))
  })

  it('is stable for the same path', () => {
    expect(projectColor('/a/b')).toBe(projectColor('/a/b'))
  })

  it('spreads different paths across several colors', () => {
    const paths = Array.from({ length: 24 }, (_, i) => `/Users/me/project-${i}`)
    const colors = new Set(paths.map(projectColor))
    expect(colors.size).toBeGreaterThan(4)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/shared/projectColor.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/projectColor"`.

- [ ] **Step 4: Implementar `src/shared/projectColor.ts`**

```ts
export const PROJECT_PALETTE = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#f43f5e',
] as const

/** FNV-1a hash of the path mapped onto the palette. */
export function projectColor(path: string): string {
  let hash = 2166136261
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return PROJECT_PALETTE[(hash >>> 0) % PROJECT_PALETTE.length]!
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/shared/projectColor.test.ts && npm run typecheck`
Expected: `3 passed`; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/shared test/shared
git commit -m "feat: add shared domain models and project color"
```

---

### Task 3: JsonFile — persistência JSON atômica

**Files:**
- Create: `src/main/store/JsonFile.ts`
- Test: `test/main/JsonFile.test.ts`

**Interfaces:**
- Produces: `class JsonFile<T> { constructor(path: string, fallback: () => T, debounceMs?: number); read(): Promise<T>; writeNow(value: T): Promise<void>; schedule(value: T): void; flush(): Promise<void> }`

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/main/JsonFile.test.ts
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonFile } from '../../src/main/store/JsonFile'

const dir = () => mkdtempSync(join(tmpdir(), 'jsonfile-'))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('JsonFile', () => {
  it('returns fallback when file is missing', async () => {
    const file = new JsonFile(join(dir(), 'a.json'), () => ({ n: 1 }))
    expect(await file.read()).toEqual({ n: 1 })
  })

  it('round-trips a value with writeNow', async () => {
    const path = join(dir(), 'nested', 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }))
    await file.writeNow({ n: 42 })
    expect(await new JsonFile(path, () => ({ n: 0 })).read()).toEqual({ n: 42 })
  })

  it('backs up a corrupt file and returns fallback', async () => {
    const d = dir()
    const path = join(d, 'a.json')
    writeFileSync(path, '{ not json')
    const file = new JsonFile(path, () => ({ n: 7 }))
    expect(await file.read()).toEqual({ n: 7 })
    expect(readdirSync(d).some((f) => /^a\.corrupt-\d+\.json$/.test(f))).toBe(true)
  })

  it('debounces scheduled writes and keeps the last value', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 20)
    file.schedule({ n: 1 })
    file.schedule({ n: 2 })
    await sleep(60)
    expect(await file.read()).toEqual({ n: 2 })
  })

  it('flush writes pending value immediately', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 10_000)
    file.schedule({ n: 3 })
    await file.flush()
    expect(await file.read()).toEqual({ n: 3 })
  })

  it('supports null as a scheduled value', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile<{ n: number } | null>(path, () => ({ n: 1 }), 10_000)
    file.schedule(null)
    await file.flush()
    expect(await file.read()).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/main/JsonFile.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/store/JsonFile"`.

- [ ] **Step 3: Implementar `src/main/store/JsonFile.ts`**

```ts
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export class JsonFile<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { value: T } | null = null

  constructor(
    private readonly path: string,
    private readonly fallback: () => T,
    private readonly debounceMs = 500,
  ) {}

  async read(): Promise<T> {
    let raw: string
    try {
      raw = await fs.readFile(this.path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return this.fallback()
      throw err
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      const backup = this.path.replace(/\.json$/, '') + `.corrupt-${Date.now()}.json`
      await fs.rename(this.path, backup)
      return this.fallback()
    }
  }

  async writeNow(value: T): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(tmp, this.path)
  }

  schedule(value: T): void {
    this.pending = { value }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.pending) return
    const { value } = this.pending
    this.pending = null
    await this.writeNow(value)
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/main/JsonFile.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/store/JsonFile.ts test/main/JsonFile.test.ts
git commit -m "feat: add atomic debounced JsonFile store"
```

---

### Task 4: Funções de workspace e parser de `.code-workspace`

**Files:**
- Create: `src/shared/workspaces.ts`, `src/main/store/codeWorkspace.ts`
- Test: `test/shared/workspaces.test.ts`, `test/main/codeWorkspace.test.ts`

**Interfaces:**
- Consumes: `Workspace`, `Project` de `@shared/models`.
- Produces (em `@shared/workspaces`):
  - `type NewId = () => string`
  - `basename(p: string): string`
  - `addWorkspace(list: Workspace[], name: string, newId: NewId): Workspace[]`
  - `renameWorkspace(list: Workspace[], id: string, name: string): Workspace[]`
  - `removeWorkspace(list: Workspace[], id: string): Workspace[]`
  - `toggleWorkspace(list: Workspace[], id: string): Workspace[]`
  - `moveWorkspace(list: Workspace[], from: number, to: number): Workspace[]`
  - `addProjects(list: Workspace[], workspaceId: string, paths: string[], newId: NewId): Workspace[]`
  - `removeProject(list: Workspace[], workspaceId: string, projectId: string): Workspace[]`
  - `filterWorkspaces(list: Workspace[], query: string): Workspace[]`
- Produces (em `src/main/store/codeWorkspace.ts`): `stripJsonc(src: string): string`, `parseCodeWorkspace(json: string, filePath: string): { name: string; paths: string[] }`

- [ ] **Step 1: Escrever testes falhando de workspaces**

```ts
// test/shared/workspaces.test.ts
import { describe, expect, it } from 'vitest'
import type { Workspace } from '@shared/models'
import {
  addProjects,
  addWorkspace,
  basename,
  filterWorkspaces,
  moveWorkspace,
  removeProject,
  removeWorkspace,
  renameWorkspace,
  toggleWorkspace,
} from '@shared/workspaces'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

const sample = (): Workspace[] => [
  {
    id: 'w1',
    name: 'papersystem',
    collapsed: false,
    projects: [
      { id: 'p1', name: 'papersystem-api', path: '/g/papersystem-api' },
      { id: 'p2', name: 'papersystem-ui', path: '/g/papersystem-ui' },
    ],
  },
  { id: 'w2', name: 'edukaflow', collapsed: true, projects: [{ id: 'p3', name: 'daringtech', path: '/g/daringtech' }] },
]

describe('workspaces', () => {
  it('basename takes last path segment', () => {
    expect(basename('/Users/me/papersystem-api')).toBe('papersystem-api')
    expect(basename('/Users/me/papersystem-api/')).toBe('papersystem-api')
  })

  it('addWorkspace appends with trimmed name and default', () => {
    const newId = ids()
    const a = addWorkspace([], '  papersystem ', newId)
    expect(a).toEqual([{ id: 'id1', name: 'papersystem', projects: [], collapsed: false }])
    expect(addWorkspace(a, '   ', newId)[1]!.name).toBe('Workspace')
  })

  it('renameWorkspace ignores blank names', () => {
    expect(renameWorkspace(sample(), 'w1', 'novo')[0]!.name).toBe('novo')
    expect(renameWorkspace(sample(), 'w1', '  ')[0]!.name).toBe('papersystem')
  })

  it('removeWorkspace and toggleWorkspace', () => {
    expect(removeWorkspace(sample(), 'w1').map((w) => w.id)).toEqual(['w2'])
    expect(toggleWorkspace(sample(), 'w2')[1]!.collapsed).toBe(false)
  })

  it('moveWorkspace reorders and ignores out-of-range', () => {
    expect(moveWorkspace(sample(), 0, 1).map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(moveWorkspace(sample(), 0, 5).map((w) => w.id)).toEqual(['w1', 'w2'])
  })

  it('addProjects skips duplicates and names by basename', () => {
    const out = addProjects(sample(), 'w2', ['/g/daringtech', '/g/novo', '/g/novo'], ids())
    expect(out[1]!.projects.map((p) => p.name)).toEqual(['daringtech', 'novo'])
    expect(out[1]!.projects[1]!.id).toBe('id1')
  })

  it('removeProject', () => {
    expect(removeProject(sample(), 'w1', 'p1')[0]!.projects.map((p) => p.id)).toEqual(['p2'])
  })

  it('filterWorkspaces matches project names and expands', () => {
    const out = filterWorkspaces(sample(), 'UI')
    expect(out).toHaveLength(1)
    expect(out[0]!.projects.map((p) => p.id)).toEqual(['p2'])
  })

  it('filterWorkspaces keeps full workspace when its name matches', () => {
    const out = filterWorkspaces(sample(), 'eduka')
    expect(out).toHaveLength(1)
    expect(out[0]!.projects).toHaveLength(1)
    expect(out[0]!.collapsed).toBe(false)
  })

  it('filterWorkspaces returns list unchanged for blank query', () => {
    const list = sample()
    expect(filterWorkspaces(list, '  ')).toBe(list)
  })
})
```

- [ ] **Step 2: Escrever testes falhando do parser**

```ts
// test/main/codeWorkspace.test.ts
import { describe, expect, it } from 'vitest'
import { parseCodeWorkspace, stripJsonc } from '../../src/main/store/codeWorkspace'

describe('stripJsonc', () => {
  it('removes comments and trailing commas but keeps strings', () => {
    const src = `{
      // line comment
      "a": "http://x", /* block */
      "b": [1, 2,],
    }`
    expect(JSON.parse(stripJsonc(src))).toEqual({ a: 'http://x', b: [1, 2] })
  })

  it('keeps escaped quotes inside strings', () => {
    expect(JSON.parse(stripJsonc('{"a": "say \\"hi\\" // not comment"}'))).toEqual({
      a: 'say "hi" // not comment',
    })
  })
})

describe('parseCodeWorkspace', () => {
  it('resolves relative folders against the workspace file', () => {
    const json = `{ "folders": [ { "path": "papersystem-ui" }, { "path": "/abs/api" }, ], "settings": {} }`
    expect(parseCodeWorkspace(json, '/Users/me/work/papersystem.code-workspace')).toEqual({
      name: 'papersystem',
      paths: ['/Users/me/work/papersystem-ui', '/abs/api'],
    })
  })

  it('returns empty paths when folders missing', () => {
    expect(parseCodeWorkspace('{}', '/x/y.code-workspace')).toEqual({ name: 'y', paths: [] })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/shared/workspaces.test.ts test/main/codeWorkspace.test.ts`
Expected: FAIL — imports não resolvem.

- [ ] **Step 4: Implementar `src/shared/workspaces.ts`**

```ts
import type { Project, Workspace } from './models'

export type NewId = () => string

export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

export function addWorkspace(list: Workspace[], name: string, newId: NewId): Workspace[] {
  return [...list, { id: newId(), name: name.trim() || 'Workspace', projects: [], collapsed: false }]
}

export function renameWorkspace(list: Workspace[], id: string, name: string): Workspace[] {
  const next = name.trim()
  if (!next) return list
  return list.map((w) => (w.id === id ? { ...w, name: next } : w))
}

export function removeWorkspace(list: Workspace[], id: string): Workspace[] {
  return list.filter((w) => w.id !== id)
}

export function toggleWorkspace(list: Workspace[], id: string): Workspace[] {
  return list.map((w) => (w.id === id ? { ...w, collapsed: !w.collapsed } : w))
}

export function moveWorkspace(list: Workspace[], from: number, to: number): Workspace[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export function addProjects(list: Workspace[], workspaceId: string, paths: string[], newId: NewId): Workspace[] {
  return list.map((w) => {
    if (w.id !== workspaceId) return w
    const seen = new Set(w.projects.map((p) => p.path))
    const added: Project[] = []
    for (const path of paths) {
      if (seen.has(path)) continue
      seen.add(path)
      added.push({ id: newId(), name: basename(path), path })
    }
    return { ...w, projects: [...w.projects, ...added] }
  })
}

export function removeProject(list: Workspace[], workspaceId: string, projectId: string): Workspace[] {
  return list.map((w) =>
    w.id === workspaceId ? { ...w, projects: w.projects.filter((p) => p.id !== projectId) } : w,
  )
}

export function filterWorkspaces(list: Workspace[], query: string): Workspace[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.flatMap((w) => {
    if (w.name.toLowerCase().includes(q)) return [{ ...w, collapsed: false }]
    const projects = w.projects.filter((p) => p.name.toLowerCase().includes(q))
    return projects.length ? [{ ...w, projects, collapsed: false }] : []
  })
}
```

- [ ] **Step 5: Implementar `src/main/store/codeWorkspace.ts`**

```ts
import { basename, dirname, isAbsolute, resolve } from 'node:path'

/** Removes // and /* *\/ comments outside strings, then trailing commas. */
export function stripJsonc(src: string): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    const next = src[i + 1]
    if (inString) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

export function parseCodeWorkspace(json: string, filePath: string): { name: string; paths: string[] } {
  const data = JSON.parse(stripJsonc(json)) as { folders?: Array<{ path?: unknown }> }
  const base = dirname(filePath)
  const paths = (data.folders ?? [])
    .map((f) => f.path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => (isAbsolute(p) ? p : resolve(base, p)))
  return { name: basename(filePath).replace(/\.code-workspace$/, ''), paths }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run test/shared/workspaces.test.ts test/main/codeWorkspace.test.ts && npm run typecheck`
Expected: `14 passed`; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add src/shared/workspaces.ts src/main/store/codeWorkspace.ts test/shared/workspaces.test.ts test/main/codeWorkspace.test.ts
git commit -m "feat: add workspace operations and .code-workspace parser"
```

---

### Task 5: GitService — branch atual

**Files:**
- Create: `src/main/git/gitInfo.ts`
- Test: `test/main/gitInfo.test.ts`

**Interfaces:**
- Consumes: `GitInfo` de `@shared/models`.
- Produces: `gitInfo(cwd: string): Promise<GitInfo>`

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/main/gitInfo.test.ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitInfo } from '../../src/main/git/gitInfo'

const tmp = () => mkdtempSync(join(tmpdir(), 'gitinfo-'))
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

describe('gitInfo', () => {
  it('returns current branch, even without commits', async () => {
    const d = tmp()
    git(d, 'init', '-q', '-b', 'dev')
    expect(await gitInfo(d)).toEqual({ branch: 'dev' })
  })

  it('returns short sha when detached', async () => {
    const d = tmp()
    git(d, 'init', '-q', '-b', 'main')
    writeFileSync(join(d, 'a.txt'), 'a')
    git(d, 'add', '.')
    git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
    git(d, 'checkout', '-q', '--detach')
    expect((await gitInfo(d)).branch).toMatch(/^@[0-9a-f]{7,}$/)
  })

  it('returns null outside a repo or for missing dir', async () => {
    expect(await gitInfo(tmp())).toEqual({ branch: null })
    expect(await gitInfo('/nope/does/not/exist')).toEqual({ branch: null })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/main/gitInfo.test.ts`
Expected: FAIL — import não resolve.

- [ ] **Step 3: Implementar `src/main/git/gitInfo.ts`**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitInfo } from '@shared/models'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, timeout: 3000 })
  return stdout.trim()
}

export async function gitInfo(cwd: string): Promise<GitInfo> {
  try {
    const branch = await git(cwd, ['branch', '--show-current'])
    if (branch) return { branch }
    return { branch: `@${await git(cwd, ['rev-parse', '--short', 'HEAD'])}` }
  } catch {
    return { branch: null }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/main/gitInfo.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/git test/main/gitInfo.test.ts
git commit -m "feat: add git branch lookup"
```

---

### Task 6: PtyManager e OutputBatcher

**Files:**
- Create: `src/main/pty/OutputBatcher.ts`, `src/main/pty/PtyManager.ts`, `src/main/pty/spawnShell.ts`
- Test: `test/main/OutputBatcher.test.ts`, `test/main/PtyManager.test.ts`

**Interfaces:**
- Produces:
  - `class OutputBatcher { constructor(out: (chunk: string) => void, ms?: number); push(chunk: string): void; flush(): void }`
  - `type PtyLike = { onData(cb: (data: string) => void): unknown; onExit(cb: (e: { exitCode: number }) => void): unknown; write(data: string): void; resize(cols: number, rows: number): void; kill(): void }`
  - `type SpawnFn = (cwd: string, cols: number, rows: number) => PtyLike`
  - `type PtyEmitter = { data(panelId: string, chunk: string): void; exit(panelId: string, exitCode: number): void }`
  - `class PtyManager { constructor(spawn: SpawnFn, emit: PtyEmitter, batchMs?: number); create(panelId: string, cwd: string, cols: number, rows: number): void; write(panelId: string, data: string): void; resize(panelId: string, cols: number, rows: number): void; kill(panelId: string): void; killAll(): void; has(panelId: string): boolean }`
  - `spawnShell: SpawnFn` (node-pty real; nunca importado em testes)

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/main/OutputBatcher.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutputBatcher } from '../../src/main/pty/OutputBatcher'

describe('OutputBatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces chunks within the window', () => {
    const out: string[] = []
    const b = new OutputBatcher((c) => out.push(c), 16)
    b.push('a')
    b.push('b')
    expect(out).toEqual([])
    vi.advanceTimersByTime(16)
    expect(out).toEqual(['ab'])
  })

  it('flush emits immediately and is a no-op when empty', () => {
    const out: string[] = []
    const b = new OutputBatcher((c) => out.push(c), 16)
    b.flush()
    b.push('x')
    b.flush()
    vi.advanceTimersByTime(50)
    expect(out).toEqual(['x'])
  })
})
```

```ts
// test/main/PtyManager.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PtyManager, type PtyLike } from '../../src/main/pty/PtyManager'

class FakePty implements PtyLike {
  dataCb: ((d: string) => void) | null = null
  exitCb: ((e: { exitCode: number }) => void) | null = null
  written: string[] = []
  size: [number, number] | null = null
  killed = false
  onData(cb: (d: string) => void) {
    this.dataCb = cb
  }
  onExit(cb: (e: { exitCode: number }) => void) {
    this.exitCb = cb
  }
  write(d: string) {
    this.written.push(d)
  }
  resize(c: number, r: number) {
    this.size = [c, r]
  }
  kill() {
    this.killed = true
  }
}

function setup() {
  const spawned: Array<{ pty: FakePty; cwd: string; cols: number; rows: number }> = []
  const events: string[] = []
  const mgr = new PtyManager(
    (cwd, cols, rows) => {
      const pty = new FakePty()
      spawned.push({ pty, cwd, cols, rows })
      return pty
    },
    { data: (id, c) => events.push(`data:${id}:${c}`), exit: (id, code) => events.push(`exit:${id}:${code}`) },
    16,
  )
  return { mgr, spawned, events }
}

describe('PtyManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('spawns with cwd and size, and emits batched output', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 100, 30)
    expect(spawned[0]).toMatchObject({ cwd: '/proj', cols: 100, rows: 30 })
    spawned[0]!.pty.dataCb!('he')
    spawned[0]!.pty.dataCb!('llo')
    vi.advanceTimersByTime(16)
    expect(events).toEqual(['data:t1:hello'])
  })

  it('forwards write and resize; ignores unknown ids', () => {
    const { mgr, spawned } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.write('t1', 'ls\r')
    mgr.resize('t1', 120, 40)
    mgr.write('nope', 'x')
    expect(spawned[0]!.pty.written).toEqual(['ls\r'])
    expect(spawned[0]!.pty.size).toEqual([120, 40])
  })

  it('kill stops the process and forgets it', () => {
    const { mgr, spawned } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.kill('t1')
    expect(spawned[0]!.pty.killed).toBe(true)
    expect(mgr.has('t1')).toBe(false)
  })

  it('exit flushes output, emits exit and forgets the pty', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 80, 24)
    spawned[0]!.pty.dataCb!('bye')
    spawned[0]!.pty.exitCb!({ exitCode: 0 })
    expect(events).toEqual(['data:t1:bye', 'exit:t1:0'])
    expect(mgr.has('t1')).toBe(false)
  })

  it('re-creating the same id kills the old pty and ignores its late exit', () => {
    const { mgr, spawned, events } = setup()
    mgr.create('t1', '/proj', 80, 24)
    mgr.create('t1', '/proj', 80, 24)
    expect(spawned[0]!.pty.killed).toBe(true)
    spawned[0]!.pty.exitCb!({ exitCode: 1 })
    expect(mgr.has('t1')).toBe(true)
    expect(events).toEqual([])
  })

  it('killAll kills every pty', () => {
    const { mgr, spawned } = setup()
    mgr.create('a', '/p', 80, 24)
    mgr.create('b', '/p', 80, 24)
    mgr.killAll()
    expect(spawned.every((s) => s.pty.killed)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/main/OutputBatcher.test.ts test/main/PtyManager.test.ts`
Expected: FAIL — imports não resolvem.

- [ ] **Step 3: Implementar `OutputBatcher.ts`**

```ts
// src/main/pty/OutputBatcher.ts
export class OutputBatcher {
  private buffer = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly out: (chunk: string) => void,
    private readonly ms = 16,
  ) {}

  push(chunk: string): void {
    this.buffer += chunk
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.ms)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.buffer) return
    const chunk = this.buffer
    this.buffer = ''
    this.out(chunk)
  }
}
```

- [ ] **Step 4: Implementar `PtyManager.ts`**

```ts
// src/main/pty/PtyManager.ts
import { OutputBatcher } from './OutputBatcher'

export type PtyLike = {
  onData(cb: (data: string) => void): unknown
  onExit(cb: (e: { exitCode: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export type SpawnFn = (cwd: string, cols: number, rows: number) => PtyLike

export type PtyEmitter = {
  data(panelId: string, chunk: string): void
  exit(panelId: string, exitCode: number): void
}

type Entry = { proc: PtyLike; batcher: OutputBatcher }

export class PtyManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly spawn: SpawnFn,
    private readonly emit: PtyEmitter,
    private readonly batchMs = 16,
  ) {}

  has(panelId: string): boolean {
    return this.entries.has(panelId)
  }

  create(panelId: string, cwd: string, cols: number, rows: number): void {
    this.kill(panelId)
    const proc = this.spawn(cwd, cols, rows)
    const batcher = new OutputBatcher((chunk) => this.emit.data(panelId, chunk), this.batchMs)
    proc.onData((data) => batcher.push(data))
    proc.onExit(({ exitCode }) => {
      if (this.entries.get(panelId)?.proc !== proc) return
      batcher.flush()
      this.entries.delete(panelId)
      this.emit.exit(panelId, exitCode)
    })
    this.entries.set(panelId, { proc, batcher })
  }

  write(panelId: string, data: string): void {
    this.entries.get(panelId)?.proc.write(data)
  }

  resize(panelId: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    this.entries.get(panelId)?.proc.resize(cols, rows)
  }

  kill(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (!entry) return
    this.entries.delete(panelId)
    entry.batcher.flush()
    entry.proc.kill()
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id)
  }
}
```

- [ ] **Step 5: Implementar `spawnShell.ts`**

```ts
// src/main/pty/spawnShell.ts
import * as pty from 'node-pty'
import type { SpawnFn } from './PtyManager'

export const spawnShell: SpawnFn = (cwd, cols, rows) =>
  pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], {
    name: 'xterm-256color',
    cwd,
    cols,
    rows,
    env: { ...process.env, TERM_PROGRAM: 'next-ide' } as Record<string, string>,
  })
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run test/main/OutputBatcher.test.ts test/main/PtyManager.test.ts && npm run typecheck`
Expected: `8 passed`; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add src/main/pty test/main/OutputBatcher.test.ts test/main/PtyManager.test.ts
git commit -m "feat: add pty manager with batched output"
```

---

### Task 7: Contrato IPC, handlers, preload e wiring do main

**Files:**
- Create: `src/shared/ipc-contract.ts`, `src/main/ipc/register.ts`, `src/main/ipc/handlers.ts`, `src/main/store/stores.ts`, `src/renderer/src/env.d.ts`
- Modify: `src/main/index.ts` (substituir inteiro), `src/preload/index.ts` (substituir inteiro)
- Test: `test/main/register.test.ts`, `test/main/handlers.test.ts`

**Interfaces:**
- Consumes: `JsonFile` (Task 3), `parseCodeWorkspace` (Task 4), `gitInfo` (Task 5), `PtyManager`, `spawnShell` (Task 6), modelos (Task 2).
- Produces (em `@shared/ipc-contract`): `InvokeMap`, `EventMap`, `InvokeChannel`, `InvokeArgs<K>`, `InvokeResult<K>`, `EventChannel`, `Handlers`, `INVOKE_CHANNELS`, `EVENT_CHANNELS`, `NextIdeApi`.
- Produces: `window.api: NextIdeApi` no renderer; `registerHandlers(ipc: IpcMainLike, handlers: Handlers): void`; `buildHandlers(deps: HandlerDeps): Handlers`; `createStores(dir: string): Stores`.

- [ ] **Step 1: Criar `src/shared/ipc-contract.ts`**

```ts
import type { GitInfo, LayoutState, Settings, Workspace } from './models'

export type InvokeMap = {
  'workspace:get': { args: []; result: Workspace[] }
  'workspace:save': { args: [workspaces: Workspace[]]; result: void }
  'settings:get': { args: []; result: Settings }
  'settings:save': { args: [settings: Settings]; result: void }
  'layout:get': { args: []; result: LayoutState | null }
  'layout:save': { args: [layout: LayoutState]; result: void }
  'fs:pickFolder': { args: []; result: string | null }
  'fs:pickWorkspaceFile': { args: []; result: { name: string; paths: string[] } | null }
  'git:info': { args: [projectPath: string]; result: GitInfo }
  'pty:create': { args: [panelId: string, cwd: string, cols: number, rows: number]; result: void }
  'pty:write': { args: [panelId: string, data: string]; result: void }
  'pty:resize': { args: [panelId: string, cols: number, rows: number]; result: void }
  'pty:kill': { args: [panelId: string]; result: void }
}

export type EventMap = {
  'pty:data': [panelId: string, chunk: string]
  'pty:exit': [panelId: string, exitCode: number]
}

export type InvokeChannel = keyof InvokeMap
export type InvokeArgs<K extends InvokeChannel> = InvokeMap[K]['args']
export type InvokeResult<K extends InvokeChannel> = InvokeMap[K]['result']
export type EventChannel = keyof EventMap

export type Handlers = {
  [K in InvokeChannel]: (...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>
}

export const INVOKE_CHANNELS = [
  'workspace:get',
  'workspace:save',
  'settings:get',
  'settings:save',
  'layout:get',
  'layout:save',
  'fs:pickFolder',
  'fs:pickWorkspaceFile',
  'git:info',
  'pty:create',
  'pty:write',
  'pty:resize',
  'pty:kill',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = ['pty:data', 'pty:exit'] as const satisfies readonly EventChannel[]

// Compile-time guard: every channel in the maps must be listed above.
type MissingInvoke = Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>
type MissingEvent = Exclude<EventChannel, (typeof EVENT_CHANNELS)[number]>
export const CONTRACT_COMPLETE: [MissingInvoke, MissingEvent] extends [never, never] ? true : false = true

export interface NextIdeApi {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>
  on<K extends EventChannel>(channel: K, listener: (...args: EventMap[K]) => void): () => void
}
```

- [ ] **Step 2: Escrever teste falhando de `registerHandlers`**

```ts
// test/main/register.test.ts
import { describe, expect, it } from 'vitest'
import { INVOKE_CHANNELS, type Handlers } from '@shared/ipc-contract'
import { registerHandlers } from '../../src/main/ipc/register'

describe('registerHandlers', () => {
  it('registers every channel and strips the event argument', async () => {
    const registered = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const calls: unknown[][] = []
    const handlers = Object.fromEntries(
      INVOKE_CHANNELS.map((c) => [c, (...args: unknown[]) => (calls.push([c, ...args]), 'ok')]),
    ) as unknown as Handlers
    registerHandlers({ handle: (channel, fn) => void registered.set(channel, fn) }, handlers)
    expect([...registered.keys()].sort()).toEqual([...INVOKE_CHANNELS].sort())
    expect(await registered.get('git:info')!({ sender: 1 }, '/proj')).toBe('ok')
    expect(calls).toEqual([['git:info', '/proj']])
  })
})
```

- [ ] **Step 3: Escrever teste falhando de `buildHandlers`**

```ts
// test/main/handlers.test.ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/models'
import { buildHandlers, type HandlerDeps } from '../../src/main/ipc/handlers'
import { createStores } from '../../src/main/store/stores'

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps & { ptyCalls: unknown[][] } {
  const ptyCalls: unknown[][] = []
  return {
    stores: createStores(mkdtempSync(join(tmpdir(), 'handlers-'))),
    pty: {
      create: (...a) => void ptyCalls.push(['create', ...a]),
      write: (...a) => void ptyCalls.push(['write', ...a]),
      resize: (...a) => void ptyCalls.push(['resize', ...a]),
      kill: (...a) => void ptyCalls.push(['kill', ...a]),
    },
    pickFolder: async () => '/picked',
    pickWorkspaceFile: async () => null,
    readTextFile: async () => '{}',
    gitInfo: async () => ({ branch: 'dev' }),
    ptyCalls,
    ...over,
  }
}

describe('buildHandlers', () => {
  it('workspace get/save round-trips after flush', async () => {
    const d = deps()
    const h = buildHandlers(d)
    expect(await h['workspace:get']()).toEqual([])
    const ws = [{ id: 'w', name: 'x', projects: [], collapsed: false }]
    await h['workspace:save'](ws)
    await d.stores.workspaces.flush()
    expect(await h['workspace:get']()).toEqual(ws)
  })

  it('settings:get merges defaults', async () => {
    const d = deps()
    await d.stores.settings.writeNow({ ...DEFAULT_SETTINGS, theme: 'light' })
    const s = await buildHandlers(d)['settings:get']()
    expect(s.theme).toBe('light')
    expect(s.statusline).toEqual(DEFAULT_SETTINGS.statusline)
  })

  it('layout:get returns null by default', async () => {
    expect(await buildHandlers(deps())['layout:get']()).toBeNull()
  })

  it('fs:pickWorkspaceFile parses the chosen file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw-'))
    const file = join(dir, 'papersystem.code-workspace')
    writeFileSync(file, '{ "folders": [{ "path": "api" }] }')
    const h = buildHandlers(
      deps({
        pickWorkspaceFile: async () => file,
        readTextFile: async (p) => (await import('node:fs/promises')).readFile(p, 'utf8'),
      }),
    )
    expect(await h['fs:pickWorkspaceFile']()).toEqual({ name: 'papersystem', paths: [join(dir, 'api')] })
  })

  it('fs:pickWorkspaceFile returns null when cancelled', async () => {
    expect(await buildHandlers(deps())['fs:pickWorkspaceFile']()).toBeNull()
  })

  it('pty channels delegate to the manager', async () => {
    const d = deps()
    const h = buildHandlers(d)
    await h['pty:create']('t', '/p', 80, 24)
    await h['pty:write']('t', 'ls')
    await h['pty:resize']('t', 90, 30)
    await h['pty:kill']('t')
    expect(d.ptyCalls).toEqual([
      ['create', 't', '/p', 80, 24],
      ['write', 't', 'ls'],
      ['resize', 't', 90, 30],
      ['kill', 't'],
    ])
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run test/main/register.test.ts test/main/handlers.test.ts`
Expected: FAIL — imports não resolvem.

- [ ] **Step 5: Implementar `register.ts`, `stores.ts`, `handlers.ts`**

```ts
// src/main/ipc/register.ts
import { INVOKE_CHANNELS, type Handlers } from '@shared/ipc-contract'

export type IpcMainLike = {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void
}

export function registerHandlers(ipc: IpcMainLike, handlers: Handlers): void {
  for (const channel of INVOKE_CHANNELS) {
    const fn = handlers[channel] as (...args: unknown[]) => unknown
    ipc.handle(channel, (_event, ...args) => fn(...args))
  }
}
```

```ts
// src/main/store/stores.ts
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type LayoutState, type Settings, type Workspace } from '@shared/models'
import { JsonFile } from './JsonFile'

export type Stores = {
  workspaces: JsonFile<Workspace[]>
  settings: JsonFile<Settings>
  layout: JsonFile<LayoutState | null>
}

export function createStores(dir: string): Stores {
  return {
    workspaces: new JsonFile<Workspace[]>(join(dir, 'workspaces.json'), () => []),
    settings: new JsonFile<Settings>(join(dir, 'settings.json'), () => DEFAULT_SETTINGS),
    layout: new JsonFile<LayoutState | null>(join(dir, 'layout.json'), () => null),
  }
}
```

```ts
// src/main/ipc/handlers.ts
import type { Handlers } from '@shared/ipc-contract'
import { DEFAULT_SETTINGS, type GitInfo } from '@shared/models'
import type { PtyManager } from '../pty/PtyManager'
import { parseCodeWorkspace } from '../store/codeWorkspace'
import type { Stores } from '../store/stores'

export type HandlerDeps = {
  stores: Stores
  pty: Pick<PtyManager, 'create' | 'write' | 'resize' | 'kill'>
  pickFolder: () => Promise<string | null>
  pickWorkspaceFile: () => Promise<string | null>
  readTextFile: (path: string) => Promise<string>
  gitInfo: (cwd: string) => Promise<GitInfo>
}

export function buildHandlers(d: HandlerDeps): Handlers {
  return {
    'workspace:get': () => d.stores.workspaces.read(),
    'workspace:save': (workspaces) => d.stores.workspaces.schedule(workspaces),
    'settings:get': async () => ({ ...DEFAULT_SETTINGS, ...(await d.stores.settings.read()) }),
    'settings:save': (settings) => d.stores.settings.writeNow(settings),
    'layout:get': () => d.stores.layout.read(),
    'layout:save': (layout) => d.stores.layout.schedule(layout),
    'fs:pickFolder': () => d.pickFolder(),
    'fs:pickWorkspaceFile': async () => {
      const file = await d.pickWorkspaceFile()
      if (!file) return null
      return parseCodeWorkspace(await d.readTextFile(file), file)
    },
    'git:info': (projectPath) => d.gitInfo(projectPath),
    'pty:create': (panelId, cwd, cols, rows) => d.pty.create(panelId, cwd, cols, rows),
    'pty:write': (panelId, data) => d.pty.write(panelId, data),
    'pty:resize': (panelId, cols, rows) => d.pty.resize(panelId, cols, rows),
    'pty:kill': (panelId) => d.pty.kill(panelId),
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run test/main/register.test.ts test/main/handlers.test.ts`
Expected: `7 passed`.

- [ ] **Step 7: Substituir `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type NextIdeApi } from '@shared/ipc-contract'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

const api: NextIdeApi = {
  invoke: (channel, ...args) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`blocked channel ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, listener) => {
    if (!eventAllowed.has(channel)) throw new Error(`blocked channel ${channel}`)
    const wrapped = (_e: IpcRendererEvent, ...args: unknown[]) => (listener as (...a: unknown[]) => void)(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 8: Criar `src/renderer/src/env.d.ts`**

```ts
import type { NextIdeApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: NextIdeApi
  }
}

export {}
```

- [ ] **Step 9: Substituir `src/main/index.ts`**

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventChannel, EventMap } from '@shared/ipc-contract'
import { gitInfo } from './git/gitInfo'
import { buildHandlers } from './ipc/handlers'
import { registerHandlers } from './ipc/register'
import { PtyManager } from './pty/PtyManager'
import { spawnShell } from './pty/spawnShell'
import { createStores } from './store/stores'

if (process.env.NEXT_IDE_USER_DATA) app.setPath('userData', process.env.NEXT_IDE_USER_DATA)

let mainWindow: BrowserWindow | null = null

function send<K extends EventChannel>(channel: K, ...args: EventMap[K]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

const stores = createStores(app.getPath('userData'))
const ptys = new PtyManager(spawnShell, {
  data: (id, chunk) => send('pty:data', id, chunk),
  exit: (id, code) => send('pty:exit', id, code),
})

async function pickFolder(): Promise<string | null> {
  if (process.env.NEXT_IDE_E2E_PICK_FOLDER) return process.env.NEXT_IDE_E2E_PICK_FOLDER
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function pickWorkspaceFile(): Promise<string | null> {
  if (process.env.NEXT_IDE_E2E_PICK_WORKSPACE) return process.env.NEXT_IDE_E2E_PICK_WORKSPACE
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'VS Code Workspace', extensions: ['code-workspace'] }],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

registerHandlers(
  ipcMain,
  buildHandlers({
    stores,
    pty: ptys,
    pickFolder,
    pickWorkspaceFile,
    readTextFile: (p) => readFile(p, 'utf8'),
    gitInfo,
  }),
)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

void app.whenReady().then(() => {
  mainWindow = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  ptys.killAll()
  void Promise.allSettled([stores.workspaces.flush(), stores.layout.flush(), stores.settings.flush()]).finally(
    () => app.quit(),
  )
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 10: Typecheck, testes e E2E de fumaça**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: typecheck limpo; todos os unitários passam; `1 passed` no E2E (app ainda abre).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add typed IPC contract, main handlers and preload bridge"
```

---

### Task 8: Dock — sessões, comandos, abas e placeholder de agente

**Files:**
- Create: `src/renderer/src/stores/sessionsStore.ts`, `src/renderer/src/dock/panelOptions.ts`, `src/renderer/src/dock/stateStyle.ts`, `src/renderer/src/dock/dockStore.ts`, `src/renderer/src/dock/PanelTab.tsx`, `src/renderer/src/dock/Dock.tsx`, `src/renderer/src/panels/agent/AgentStubPanel.tsx`, `src/renderer/src/panels/terminal/TerminalPanel.tsx` (placeholder, substituído na Task 10)
- Modify: `src/renderer/src/App.tsx` (substituir inteiro)
- Test: `test/renderer/sessionsStore.test.ts`, `test/renderer/panelOptions.test.ts`, `test/renderer/stateStyle.test.ts`

**Interfaces:**
- Consumes: `PanelParams`, `PanelType`, `SessionState` (Task 2), `basename` (Task 4), `projectColor` (Task 2).
- Produces:
  - `useSessions` (zustand): `{ byId: Record<string, SessionInfo>; order: string[]; add(s: SessionInfo): void; remove(panelId: string): void; setState(panelId: string, state: SessionState): void }`, `type SessionInfo = { panelId: string; type: 'agent' | 'terminal'; projectPath: string; title: string; state: SessionState }`
  - `panelTitle(p: PanelParams): string`, `newPanelId(type: PanelType, uuid?: () => string): string`, `type Placement`, `buildAddPanelOptions(params: PanelParams, id: string, placement: Placement): AddPanelOptions<PanelParams>`
  - `stateDotClass(state: SessionState): string`
  - `useDock` (zustand): `{ api: DockviewApi | null; setApi(api: DockviewApi): void; open(params: PanelParams): void; split(direction: 'right' | 'below'): void; closeActive(): void; focus(panelId: string): void; focusGroup(index: number): void }`
  - `onPanelRemoved` hook point: `Dock.tsx` exporta `registerPanelRemovedListener(fn: (panelId: string, params: PanelParams | undefined) => void): void` para a Task 10 usar.

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/renderer/sessionsStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessions } from '@renderer/stores/sessionsStore'

const s = (panelId: string) => ({
  panelId,
  type: 'terminal' as const,
  projectPath: '/p',
  title: 'p · zsh',
  state: 'idle' as const,
})

describe('sessionsStore', () => {
  beforeEach(() => useSessions.setState({ byId: {}, order: [] }))

  it('adds in order and ignores duplicates', () => {
    useSessions.getState().add(s('a'))
    useSessions.getState().add(s('b'))
    useSessions.getState().add(s('a'))
    expect(useSessions.getState().order).toEqual(['a', 'b'])
  })

  it('updates state and removes', () => {
    useSessions.getState().add(s('a'))
    useSessions.getState().setState('a', 'exited')
    expect(useSessions.getState().byId.a!.state).toBe('exited')
    useSessions.getState().setState('zzz', 'running')
    useSessions.getState().remove('a')
    expect(useSessions.getState().order).toEqual([])
    expect(useSessions.getState().byId).toEqual({})
  })
})
```

```ts
// test/renderer/panelOptions.test.ts
import { describe, expect, it } from 'vitest'
import { buildAddPanelOptions, newPanelId, panelTitle } from '@renderer/dock/panelOptions'

describe('panelOptions', () => {
  it('panelTitle per type', () => {
    expect(panelTitle({ type: 'agent', projectPath: '/g/api' })).toBe('api · claude')
    expect(panelTitle({ type: 'terminal', projectPath: '/g/api' })).toBe('api · zsh')
    expect(panelTitle({ type: 'file', projectPath: '/g/api', filePath: '/g/api/src/a.ts' })).toBe('a.ts')
  })

  it('newPanelId prefixes type', () => {
    expect(newPanelId('terminal', () => 'u1')).toBe('terminal-u1')
  })

  it('builds options for active group', () => {
    const params = { type: 'terminal' as const, projectPath: '/g/api' }
    expect(buildAddPanelOptions(params, 'terminal-1', { kind: 'activeGroup', groupId: 'g1' })).toEqual({
      id: 'terminal-1',
      component: 'terminal',
      title: 'api · zsh',
      params,
      renderer: 'always',
      position: { referenceGroup: 'g1' },
    })
    expect(buildAddPanelOptions(params, 'terminal-1', { kind: 'activeGroup' })).not.toHaveProperty('position')
  })

  it('builds options for split', () => {
    const params = { type: 'agent' as const, projectPath: '/g/api' }
    expect(
      buildAddPanelOptions(params, 'agent-1', { kind: 'split', referencePanelId: 'terminal-1', direction: 'below' })
        .position,
    ).toEqual({ referencePanel: 'terminal-1', direction: 'below' })
  })
})
```

```ts
// test/renderer/stateStyle.test.ts
import { describe, expect, it } from 'vitest'
import { stateDotClass } from '@renderer/dock/stateStyle'

describe('stateDotClass', () => {
  it('maps each state to a color class', () => {
    expect(stateDotClass('running')).toContain('bg-blue-500')
    expect(stateDotClass('running')).toContain('animate-pulse')
    expect(stateDotClass('awaiting_permission')).toContain('bg-orange-500')
    expect(stateDotClass('error')).toContain('bg-red-500')
    expect(stateDotClass('idle')).toContain('bg-neutral-500')
    expect(stateDotClass('exited')).toContain('bg-neutral-700')
    expect(stateDotClass('starting')).toContain('bg-neutral-400')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/renderer`
Expected: FAIL — imports não resolvem.

- [ ] **Step 3: Implementar `sessionsStore.ts`, `panelOptions.ts`, `stateStyle.ts`**

```ts
// src/renderer/src/stores/sessionsStore.ts
import { create } from 'zustand'
import type { SessionState } from '@shared/models'

export type SessionInfo = {
  panelId: string
  type: 'agent' | 'terminal'
  projectPath: string
  title: string
  state: SessionState
}

type SessionsState = {
  byId: Record<string, SessionInfo>
  order: string[]
  add(session: SessionInfo): void
  remove(panelId: string): void
  setState(panelId: string, state: SessionState): void
}

export const useSessions = create<SessionsState>()((set) => ({
  byId: {},
  order: [],
  add: (session) =>
    set((st) =>
      st.byId[session.panelId]
        ? st
        : { byId: { ...st.byId, [session.panelId]: session }, order: [...st.order, session.panelId] },
    ),
  remove: (panelId) =>
    set((st) => {
      if (!st.byId[panelId]) return st
      const { [panelId]: _removed, ...rest } = st.byId
      return { byId: rest, order: st.order.filter((id) => id !== panelId) }
    }),
  setState: (panelId, state) =>
    set((st) => {
      const current = st.byId[panelId]
      return current ? { byId: { ...st.byId, [panelId]: { ...current, state } } } : st
    }),
}))
```

```ts
// src/renderer/src/dock/panelOptions.ts
import type { AddPanelOptions } from 'dockview-react'
import type { PanelParams, PanelType } from '@shared/models'
import { basename } from '@shared/workspaces'

export function panelTitle(p: PanelParams): string {
  if (p.type === 'file') return basename(p.filePath)
  return `${basename(p.projectPath)} · ${p.type === 'agent' ? 'claude' : 'zsh'}`
}

export function newPanelId(type: PanelType, uuid: () => string = () => crypto.randomUUID()): string {
  return `${type}-${uuid()}`
}

export type Placement =
  | { kind: 'activeGroup'; groupId?: string }
  | { kind: 'split'; referencePanelId: string; direction: 'right' | 'below' }

export function buildAddPanelOptions(params: PanelParams, id: string, placement: Placement): AddPanelOptions<PanelParams> {
  const base: AddPanelOptions<PanelParams> = {
    id,
    component: params.type,
    title: panelTitle(params),
    params,
    renderer: 'always',
  }
  if (placement.kind === 'split') {
    return { ...base, position: { referencePanel: placement.referencePanelId, direction: placement.direction } }
  }
  return placement.groupId ? { ...base, position: { referenceGroup: placement.groupId } } : base
}
```

```ts
// src/renderer/src/dock/stateStyle.ts
import type { SessionState } from '@shared/models'

const CLASSES: Record<SessionState, string> = {
  starting: 'bg-neutral-400',
  idle: 'bg-neutral-500',
  running: 'bg-blue-500 animate-pulse',
  awaiting_permission: 'bg-orange-500',
  error: 'bg-red-500',
  exited: 'bg-neutral-700',
}

export function stateDotClass(state: SessionState): string {
  return `inline-block h-2 w-2 shrink-0 rounded-full ${CLASSES[state]}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/renderer`
Expected: `7 passed`.

- [ ] **Step 5: Implementar `dockStore.ts`**

```ts
// src/renderer/src/dock/dockStore.ts
import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import type { PanelParams } from '@shared/models'
import { buildAddPanelOptions, newPanelId } from './panelOptions'

type DockState = {
  api: DockviewApi | null
  setApi(api: DockviewApi): void
  open(params: PanelParams): void
  split(direction: 'right' | 'below'): void
  closeActive(): void
  focus(panelId: string): void
  focusGroup(index: number): void
}

export const useDock = create<DockState>()((set, get) => ({
  api: null,
  setApi: (api) => set({ api }),
  open: (params) => {
    const api = get().api
    if (!api) return
    api.addPanel(buildAddPanelOptions(params, newPanelId(params.type), { kind: 'activeGroup', groupId: api.activeGroup?.id }))
  },
  split: (direction) => {
    const api = get().api
    const active = api?.activePanel
    const params = active?.params as PanelParams | undefined
    if (!api || !active || !params) return
    const next: PanelParams = params.type === 'agent' ? { type: 'agent', projectPath: params.projectPath } : params
    api.addPanel(buildAddPanelOptions(next, newPanelId(next.type), { kind: 'split', referencePanelId: active.id, direction }))
  },
  closeActive: () => get().api?.activePanel?.api.close(),
  focus: (panelId) => get().api?.getPanel(panelId)?.api.setActive(),
  focusGroup: (index) => get().api?.groups[index]?.activePanel?.api.setActive(),
}))
```

- [ ] **Step 6: Implementar `PanelTab.tsx`, placeholders e `Dock.tsx`**

```tsx
// src/renderer/src/dock/PanelTab.tsx
import type { IDockviewPanelHeaderProps } from 'dockview-react'
import type { PanelParams } from '@shared/models'
import { projectColor } from '@shared/projectColor'
import { useSessions } from '../stores/sessionsStore'
import { stateDotClass } from './stateStyle'

export function PanelTab({ api, params }: IDockviewPanelHeaderProps<PanelParams>) {
  const state = useSessions((s) => s.byId[api.id]?.state)
  return (
    <div
      data-testid="panel-tab"
      className="flex h-full items-center gap-2 px-3 text-xs text-neutral-300"
      style={{ boxShadow: `inset 0 2px 0 ${projectColor(params.projectPath)}` }}
      onDoubleClick={() => (api.isMaximized() ? api.exitMaximized() : api.maximize())}
    >
      {state && <span className={stateDotClass(state)} />}
      <span className="max-w-48 truncate">{api.title}</span>
      <button
        aria-label={`Fechar ${api.title}`}
        className="rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        onClick={(e) => {
          e.stopPropagation()
          api.close()
        }}
      >
        ×
      </button>
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/agent/AgentStubPanel.tsx
import type { IDockviewPanelProps } from 'dockview-react'
import type { AgentPanelParams } from '@shared/models'

export function AgentStubPanel({ params }: IDockviewPanelProps<AgentPanelParams>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-500">
      <span>Painel de agente — chega no Plano 2</span>
      <code className="text-xs text-neutral-600">{params.projectPath}</code>
    </div>
  )
}
```

```tsx
// src/renderer/src/panels/terminal/TerminalPanel.tsx  (placeholder; Task 10 substitui)
import type { IDockviewPanelProps } from 'dockview-react'
import type { TerminalPanelParams } from '@shared/models'

export function TerminalPanel({ params }: IDockviewPanelProps<TerminalPanelParams>) {
  return <div className="p-4 text-sm text-neutral-500">Terminal em {params.projectPath}</div>
}
```

```tsx
// src/renderer/src/dock/Dock.tsx
import {
  DockviewReact,
  themeDark,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { useCallback, type FunctionComponent } from 'react'
import type { PanelParams } from '@shared/models'
import { AgentStubPanel } from '../panels/agent/AgentStubPanel'
import { TerminalPanel } from '../panels/terminal/TerminalPanel'
import { useSessions } from '../stores/sessionsStore'
import { useDock } from './dockStore'
import { PanelTab } from './PanelTab'
import { panelTitle } from './panelOptions'

const components = {
  agent: AgentStubPanel,
  terminal: TerminalPanel,
} as unknown as Record<string, FunctionComponent<IDockviewPanelProps>>

type RemovedListener = (panelId: string, params: PanelParams | undefined) => void
const removedListeners: RemovedListener[] = []
export function registerPanelRemovedListener(fn: RemovedListener): void {
  removedListeners.push(fn)
}

function Watermark() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-600">
      Abra um projeto na barra lateral: ▶ Claude · ⌨ Terminal
    </div>
  )
}

export function Dock() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api
    useDock.getState().setApi(api)
    api.onDidAddPanel((panel) => {
      const params = panel.params as PanelParams | undefined
      if (!params || params.type === 'file') return
      useSessions.getState().add({
        panelId: panel.id,
        type: params.type,
        projectPath: params.projectPath,
        title: panelTitle(params),
        state: 'idle',
      })
    })
    api.onDidRemovePanel((panel) => {
      useSessions.getState().remove(panel.id)
      for (const fn of removedListeners) fn(panel.id, panel.params as PanelParams | undefined)
    })
  }, [])

  return (
    <DockviewReact
      className="h-full"
      theme={themeDark}
      components={components}
      defaultTabComponent={PanelTab as FunctionComponent<any>}
      watermarkComponent={Watermark}
      onReady={onReady}
    />
  )
}
```

- [ ] **Step 7: Substituir `App.tsx`**

```tsx
// src/renderer/src/App.tsx
import { Dock } from './dock/Dock'

export function App() {
  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-neutral-950 text-neutral-200">
      <aside className="overflow-y-auto border-r border-neutral-800" data-testid="sidebar" />
      <main className="min-w-0">
        <Dock />
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Atualizar smoke E2E e rodar tudo**

O App não mostra mais o texto "next-ide"; substituir `e2e/smoke.spec.ts` para verificar o watermark:

```ts
// e2e/smoke.spec.ts
import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app abre com dock vazio', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('next-ide')
  await expect(page.getByText('Abra um projeto na barra lateral')).toBeVisible()
  await app.close()
})
```

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: typecheck limpo; unitários verdes; `1 passed` no E2E.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add dockview grid with session tracking and custom tabs"
```

---

### Task 9: Sidebar de workspaces

**Files:**
- Create: `src/renderer/src/stores/workspaceStore.ts`, `src/renderer/src/sidebar/Sidebar.tsx`, `src/renderer/src/sidebar/WorkspaceSection.tsx`, `src/renderer/src/sidebar/ProjectRow.tsx`, `src/renderer/src/sidebar/ActiveSessions.tsx`, `src/renderer/src/sidebar/useGitBranch.ts`
- Modify: `src/renderer/src/App.tsx` (trocar `<aside ... />` por `<Sidebar />`)
- Test: `e2e/sidebar.spec.ts`

**Interfaces:**
- Consumes: funções de `@shared/workspaces` (Task 4), `useSessions` (Task 8), `useDock` (Task 8), `stateDotClass` (Task 8), `projectColor` (Task 2), `window.api` (Task 7).
- Produces: `useWorkspaces` (zustand): `{ workspaces: Workspace[]; loaded: boolean; query: string; load(): Promise<void>; setQuery(q: string): void; addWorkspace(name: string): void; rename(id: string, name: string): void; remove(id: string): void; toggle(id: string): void; addFolder(workspaceId: string): Promise<void>; importCodeWorkspace(): Promise<void>; removeProject(workspaceId: string, projectId: string): void }`; `<Sidebar />`.

- [ ] **Step 1: Escrever E2E falhando**

```ts
// e2e/sidebar.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('cria workspace, adiciona pasta e abre terminal e agente', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-alpha-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('papersystem')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em papersystem' }).click()
  await expect(page.getByTestId('project-row').filter({ hasText: name })).toBeVisible()

  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await expect(page.getByTestId('active-sessions')).toContainText(`${name} · zsh`)

  await page.getByPlaceholder('Filtrar projetos').fill('zzz-nada')
  await expect(page.getByTestId('project-row')).toHaveCount(0)
  await app.close()
})

test('importa .code-workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-'))
  mkdirSync(join(dir, 'papersystem-api'))
  mkdirSync(join(dir, 'papersystem-ui'))
  const file = join(dir, 'papersystem.code-workspace')
  writeFileSync(file, '{ "folders": [ { "path": "papersystem-api" }, { "path": "papersystem-ui" }, ] }')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_WORKSPACE: file } })

  await page.getByRole('button', { name: 'Importar .code-workspace' }).click()
  await expect(page.getByTestId('workspace-header').filter({ hasText: 'papersystem' })).toBeVisible()
  await expect(page.getByTestId('project-row')).toHaveCount(2)
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:e2e -- e2e/sidebar.spec.ts`
Expected: FAIL — botão "Novo workspace" não encontrado.

- [ ] **Step 3: Implementar `workspaceStore.ts`**

```ts
// src/renderer/src/stores/workspaceStore.ts
import { create } from 'zustand'
import type { Workspace } from '@shared/models'
import {
  addProjects,
  addWorkspace,
  removeProject,
  removeWorkspace,
  renameWorkspace,
  toggleWorkspace,
} from '@shared/workspaces'

type WorkspaceState = {
  workspaces: Workspace[]
  loaded: boolean
  query: string
  load(): Promise<void>
  setQuery(q: string): void
  addWorkspace(name: string): void
  rename(id: string, name: string): void
  remove(id: string): void
  toggle(id: string): void
  addFolder(workspaceId: string): Promise<void>
  importCodeWorkspace(): Promise<void>
  removeProject(workspaceId: string, projectId: string): void
}

const uuid = () => crypto.randomUUID()

export const useWorkspaces = create<WorkspaceState>()((set, get) => {
  const commit = (next: Workspace[]) => {
    set({ workspaces: next })
    void window.api.invoke('workspace:save', next)
  }
  return {
    workspaces: [],
    loaded: false,
    query: '',
    load: async () => set({ workspaces: await window.api.invoke('workspace:get'), loaded: true }),
    setQuery: (query) => set({ query }),
    addWorkspace: (name) => commit(addWorkspace(get().workspaces, name, uuid)),
    rename: (id, name) => commit(renameWorkspace(get().workspaces, id, name)),
    remove: (id) => commit(removeWorkspace(get().workspaces, id)),
    toggle: (id) => commit(toggleWorkspace(get().workspaces, id)),
    addFolder: async (workspaceId) => {
      const path = await window.api.invoke('fs:pickFolder')
      if (path) commit(addProjects(get().workspaces, workspaceId, [path], uuid))
    },
    importCodeWorkspace: async () => {
      const picked = await window.api.invoke('fs:pickWorkspaceFile')
      if (!picked) return
      const withWs = addWorkspace(get().workspaces, picked.name, uuid)
      const created = withWs[withWs.length - 1]!
      commit(addProjects(withWs, created.id, picked.paths, uuid))
    },
    removeProject: (workspaceId, projectId) => commit(removeProject(get().workspaces, workspaceId, projectId)),
  }
})
```

- [ ] **Step 4: Implementar `useGitBranch.ts` e `ActiveSessions.tsx`**

```ts
// src/renderer/src/sidebar/useGitBranch.ts
import { useEffect, useState } from 'react'

export function useGitBranch(projectPath: string): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () =>
      void window.api.invoke('git:info', projectPath).then((info) => {
        if (alive) setBranch(info.branch)
      })
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
    }
  }, [projectPath])
  return branch
}
```

```tsx
// src/renderer/src/sidebar/ActiveSessions.tsx
import { stateDotClass } from '../dock/stateStyle'
import { useDock } from '../dock/dockStore'
import { useSessions } from '../stores/sessionsStore'

export function ActiveSessions() {
  const order = useSessions((s) => s.order)
  const byId = useSessions((s) => s.byId)
  return (
    <section data-testid="active-sessions" className="px-2 pb-3">
      <h2 className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
        Sessões ativas ({order.length})
      </h2>
      {order.map((id) => {
        const s = byId[id]!
        return (
          <button
            key={id}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
            onClick={() => useDock.getState().focus(id)}
          >
            <span className={stateDotClass(s.state)} />
            <span className="truncate">{s.title}</span>
          </button>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 5: Implementar `ProjectRow.tsx` e `WorkspaceSection.tsx`**

```tsx
// src/renderer/src/sidebar/ProjectRow.tsx
import type { Project } from '@shared/models'
import { projectColor } from '@shared/projectColor'
import { useDock } from '../dock/dockStore'
import { useSessions } from '../stores/sessionsStore'
import { useGitBranch } from './useGitBranch'

export function ProjectRow({ project, onRemove }: { project: Project; onRemove: () => void }) {
  const branch = useGitBranch(project.path)
  const count = useSessions((s) => s.order.filter((id) => s.byId[id]!.projectPath === project.path).length)
  const open = (type: 'agent' | 'terminal') => useDock.getState().open({ type, projectPath: project.path })
  return (
    <div
      data-testid="project-row"
      title={project.path}
      className="group flex items-center gap-2 rounded py-1 pr-1 pl-5 text-sm hover:bg-neutral-800/70"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: projectColor(project.path) }} />
      <span className="min-w-0 flex-1 truncate">
        {project.name}
        {branch && <span className="ml-1 text-xs text-neutral-500">({branch})</span>}
      </span>
      {count > 0 && <span className="text-[10px] text-blue-400">●{count}</span>}
      <button
        aria-label={`Abrir Claude em ${project.name}`}
        title="Abrir Claude"
        className="rounded px-1 text-neutral-400 hover:bg-neutral-700 hover:text-orange-400"
        onClick={() => open('agent')}
      >
        ▶
      </button>
      <button
        aria-label={`Abrir terminal em ${project.name}`}
        title="Abrir terminal"
        className="rounded px-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        onClick={() => open('terminal')}
      >
        ⌨
      </button>
      <button
        aria-label={`Remover ${project.name}`}
        className="invisible rounded px-1 text-neutral-500 group-hover:visible hover:text-red-400"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}
```

```tsx
// src/renderer/src/sidebar/WorkspaceSection.tsx
import { useEffect, useState } from 'react'
import type { Workspace } from '@shared/models'
import { useWorkspaces } from '../stores/workspaceStore'
import { ProjectRow } from './ProjectRow'

export function WorkspaceSection({ workspace }: { workspace: Workspace }) {
  const { toggle, rename, remove, addFolder, removeProject } = useWorkspaces.getState()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(workspace.name)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (!confirmRemove) return
    const t = setTimeout(() => setConfirmRemove(false), 3000)
    return () => clearTimeout(t)
  }, [confirmRemove])

  return (
    <div className="pb-1">
      <div data-testid="workspace-header" className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-neutral-800/50">
        <button
          aria-label={workspace.collapsed ? `Expandir ${workspace.name}` : `Recolher ${workspace.name}`}
          className="w-4 text-xs text-neutral-500"
          onClick={() => toggle(workspace.id)}
        >
          {workspace.collapsed ? '▸' : '▾'}
        </button>
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded bg-neutral-900 px-1 text-sm outline-none ring-1 ring-neutral-700"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                rename(workspace.id, draft)
                setEditing(false)
              }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium"
            onDoubleClick={() => {
              setDraft(workspace.name)
              setEditing(true)
            }}
          >
            {workspace.name}
          </span>
        )}
        <button
          aria-label={`Adicionar pasta em ${workspace.name}`}
          title="Adicionar pasta"
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-700"
          onClick={() => void addFolder(workspace.id)}
        >
          +
        </button>
        <button
          aria-label={`Remover workspace ${workspace.name}`}
          className={`rounded px-1 text-xs ${confirmRemove ? 'text-red-400' : 'invisible text-neutral-500 group-hover:visible'}`}
          onClick={() => (confirmRemove ? remove(workspace.id) : setConfirmRemove(true))}
        >
          {confirmRemove ? 'remover?' : '×'}
        </button>
      </div>
      {!workspace.collapsed &&
        workspace.projects.map((p) => (
          <ProjectRow key={p.id} project={p} onRemove={() => removeProject(workspace.id, p.id)} />
        ))}
    </div>
  )
}
```

- [ ] **Step 6: Implementar `Sidebar.tsx`**

```tsx
// src/renderer/src/sidebar/Sidebar.tsx
import { useEffect, useState } from 'react'
import { filterWorkspaces } from '@shared/workspaces'
import { useWorkspaces } from '../stores/workspaceStore'
import { ActiveSessions } from './ActiveSessions'
import { WorkspaceSection } from './WorkspaceSection'

export function Sidebar() {
  const workspaces = useWorkspaces((s) => s.workspaces)
  const query = useWorkspaces((s) => s.query)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    void useWorkspaces.getState().load()
  }, [])

  const visible = filterWorkspaces(workspaces, query)

  return (
    <div className="flex h-full flex-col">
      <div className="h-9 shrink-0 [-webkit-app-region:drag]" />
      <div className="px-3 pb-2">
        <input
          placeholder="Filtrar projetos"
          className="w-full rounded bg-neutral-900 px-2 py-1 text-sm outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
          value={query}
          onChange={(e) => useWorkspaces.getState().setQuery(e.target.value)}
        />
      </div>
      <ActiveSessions />
      <section className="flex-1 overflow-y-auto px-2">
        <div className="flex items-center px-2 pb-1">
          <h2 className="flex-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">Workspaces</h2>
          <button
            aria-label="Novo workspace"
            title="Novo workspace"
            className="rounded px-1 text-neutral-400 hover:bg-neutral-800"
            onClick={() => setCreating(true)}
          >
            +
          </button>
          <button
            aria-label="Importar .code-workspace"
            title="Importar .code-workspace"
            className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
            onClick={() => void useWorkspaces.getState().importCodeWorkspace()}
          >
            ⇪
          </button>
        </div>
        {creating && (
          <input
            autoFocus
            placeholder="Nome do workspace"
            className="mx-2 mb-2 w-[calc(100%-1rem)] rounded bg-neutral-900 px-2 py-1 text-sm outline-none ring-1 ring-neutral-700"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setCreating(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                useWorkspaces.getState().addWorkspace(name)
                setName('')
                setCreating(false)
              }
              if (e.key === 'Escape') setCreating(false)
            }}
          />
        )}
        {visible.map((w) => (
          <WorkspaceSection key={w.id} workspace={w} />
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 7: Ligar Sidebar no `App.tsx`**

```tsx
// src/renderer/src/App.tsx
import { Dock } from './dock/Dock'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-neutral-950 text-neutral-200">
      <aside className="overflow-hidden border-r border-neutral-800" data-testid="sidebar">
        <Sidebar />
      </aside>
      <main className="min-w-0">
        <Dock />
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm run typecheck && npm run test:e2e`
Expected: typecheck limpo; `3 passed` (smoke + 2 da sidebar).

- [ ] **Step 9: Checagem manual**

Run: `npm run dev`. Criar workspace, adicionar pasta real (ex: `~/github/next-ide`), ver branch `(main)` ou `(master)` ao lado, abrir ▶ e ⌨, arrastar aba para a borda de outro grupo e confirmar split.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add workspace sidebar with active sessions and project actions"
```

---

### Task 10: Painel Terminal real (xterm + node-pty)

**Files:**
- Create: `src/renderer/src/panels/terminal/terminalRegistry.ts`
- Modify: `src/renderer/src/panels/terminal/TerminalPanel.tsx` (substituir inteiro), `src/renderer/src/dock/Dock.tsx` (registrar dispose no remove), `src/main/index.ts` (`setWindowOpenHandler`)
- Test: `e2e/terminal.spec.ts`

**Interfaces:**
- Consumes: `window.api` canais `pty:*` (Task 7), `useSessions.setState` (Task 8), `registerPanelRemovedListener` (Task 8).
- Produces: `attachTerminal(panelId: string, cwd: string, container: HTMLElement): TerminalEntry`, `disposeTerminal(panelId: string): void`, `type TerminalEntry = { term: Terminal; host: HTMLDivElement; fit(): void }`.

- [ ] **Step 1: Escrever E2E falhando**

```ts
// e2e/terminal.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('terminal roda comandos no cwd do projeto', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-term-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()

  const terminal = page.getByTestId('terminal')
  await terminal.click()
  await page.keyboard.type('echo "ok-$(basename $PWD)"\n')
  await expect(terminal.locator('.xterm-rows')).toContainText(`ok-${name}`, { timeout: 15_000 })

  await page.getByRole('button', { name: `Fechar ${name} · zsh` }).click()
  await expect(page.getByTestId('active-sessions')).not.toContainText(`${name} · zsh`)
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:e2e -- e2e/terminal.spec.ts`
Expected: FAIL — `getByTestId('terminal')` não encontrado (placeholder não tem testid).

- [ ] **Step 3: Implementar `terminalRegistry.ts`**

```ts
// src/renderer/src/panels/terminal/terminalRegistry.ts
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useSessions } from '../../stores/sessionsStore'

export type TerminalEntry = { term: Terminal; host: HTMLDivElement; fit(): void }

type InternalEntry = TerminalEntry & { dispose(): void }

// Terminals live outside React so moving a panel between dock groups never kills the shell.
const entries = new Map<string, InternalEntry>()

export function attachTerminal(panelId: string, cwd: string, container: HTMLElement): TerminalEntry {
  const existing = entries.get(panelId)
  if (existing) {
    container.appendChild(existing.host)
    return existing
  }

  const host = document.createElement('div')
  host.style.width = '100%'
  host.style.height = '100%'
  container.appendChild(host)

  const term = new Terminal({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 10_000,
    theme: { background: '#0a0a0a' },
  })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank')))
  term.open(host)

  let cols = term.cols
  let rows = term.rows
  const fit = () => {
    if (host.offsetWidth === 0 || host.offsetHeight === 0) return
    try {
      fitAddon.fit()
    } catch {
      return
    }
    if (term.cols !== cols || term.rows !== rows) {
      cols = term.cols
      rows = term.rows
      void window.api.invoke('pty:resize', panelId, cols, rows)
    }
  }

  const offData = window.api.on('pty:data', (id, chunk) => {
    if (id === panelId) term.write(chunk)
  })
  const offExit = window.api.on('pty:exit', (id, code) => {
    if (id !== panelId) return
    term.write(`\r\n\x1b[2m[processo encerrado: ${code}]\x1b[0m\r\n`)
    useSessions.getState().setState(panelId, 'exited')
  })
  const input = term.onData((data) => void window.api.invoke('pty:write', panelId, data))
  void window.api.invoke('pty:create', panelId, cwd, cols, rows)

  const entry: InternalEntry = {
    term,
    host,
    fit,
    dispose: () => {
      input.dispose()
      offData()
      offExit()
      void window.api.invoke('pty:kill', panelId)
      term.dispose()
      host.remove()
      entries.delete(panelId)
    },
  }
  entries.set(panelId, entry)
  return entry
}

export function disposeTerminal(panelId: string): void {
  entries.get(panelId)?.dispose()
}
```

- [ ] **Step 4: Substituir `TerminalPanel.tsx`**

```tsx
// src/renderer/src/panels/terminal/TerminalPanel.tsx
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef } from 'react'
import type { TerminalPanelParams } from '@shared/models'
import { attachTerminal } from './terminalRegistry'

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const entry = attachTerminal(api.id, params.projectPath, container)
    const observer = new ResizeObserver(() => entry.fit())
    observer.observe(container)
    entry.fit()
    const active = api.onDidActiveChange((e) => {
      if (!e.isActive) return
      entry.fit()
      entry.term.focus()
    })
    return () => {
      observer.disconnect()
      active.dispose()
      entry.host.remove()
    }
  }, [api, params.projectPath])

  return <div ref={ref} data-testid="terminal" className="h-full w-full overflow-hidden bg-[#0a0a0a] p-1" />
}
```

- [ ] **Step 5: Registrar dispose em `Dock.tsx`**

Adicionar no topo de `src/renderer/src/dock/Dock.tsx`, após os imports:

```ts
import { disposeTerminal } from '../panels/terminal/terminalRegistry'

registerPanelRemovedListener((panelId, params) => {
  if (params?.type === 'terminal') disposeTerminal(panelId)
})
```

(Colocar a chamada `registerPanelRemovedListener(...)` logo abaixo da definição da função `registerPanelRemovedListener`.)

- [ ] **Step 6: Abrir links externos com segurança em `src/main/index.ts`**

Trocar o import do electron e adicionar o handler dentro de `createWindow`, antes do `return win`:

```ts
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
```

```ts
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm run typecheck && npm run test:e2e`
Expected: `4 passed`.

- [ ] **Step 8: Checagem manual**

Run: `npm run dev`. Abrir terminal num projeto real, rodar `ls`, `git status`, `vim` (TUI deve funcionar), redimensionar painel (texto reflui), arrastar aba para outro grupo e confirmar que o shell **continua o mesmo** (histórico visível, sem novo prompt de login). Clicar numa URL impressa no terminal abre no navegador.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add real zsh terminal panel backed by node-pty"
```

---

### Task 11: Persistência e restauração do layout

**Files:**
- Create: `src/shared/layout.ts`, `src/renderer/src/dock/layoutPersistence.ts`
- Modify: `src/main/ipc/handlers.ts` (`layout:get` sanitiza), `src/renderer/src/dock/Dock.tsx` (restore + save no `onReady`)
- Test: `test/shared/layout.test.ts`, `e2e/restore.spec.ts`

**Interfaces:**
- Consumes: `LayoutState` (Task 2), `JsonFile` via handlers (Task 7), `DockviewApi`.
- Produces: `sanitizeLayout(value: unknown): LayoutState | null`; `restoreLayout(api: DockviewApi): Promise<void>`; `attachLayoutPersistence(api: DockviewApi): () => void`.

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/shared/layout.test.ts
import { describe, expect, it } from 'vitest'
import { sanitizeLayout } from '@shared/layout'

describe('sanitizeLayout', () => {
  it('accepts a v1 layout with grid and panels', () => {
    const dock = { grid: { root: {} }, panels: {} }
    expect(sanitizeLayout({ version: 1, dock })).toEqual({ version: 1, dock })
  })

  it.each([null, 42, 'x', {}, { version: 2, dock: { grid: {}, panels: {} } }, { version: 1, dock: { grid: {} } }])(
    'rejects %j',
    (value) => {
      expect(sanitizeLayout(value)).toBeNull()
    },
  )
})
```

```ts
// e2e/restore.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('reabrir o app restaura workspaces e painéis', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-restore-'))
  const name = basename(folder)
  const env = { NEXT_IDE_E2E_PICK_FOLDER: folder }

  const first = await launch({ env })
  await first.page.getByRole('button', { name: 'Novo workspace' }).click()
  await first.page.getByPlaceholder('Nome do workspace').fill('ws')
  await first.page.getByPlaceholder('Nome do workspace').press('Enter')
  await first.page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await first.page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await first.page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  await first.page.waitForTimeout(800)
  await first.app.close()

  const second = await launch({ userData: first.userData, env })
  await expect(second.page.getByTestId('project-row').filter({ hasText: name })).toBeVisible()
  await expect(second.page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await expect(second.page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await expect(second.page.getByTestId('active-sessions')).toContainText(`${name} · zsh`)
  await second.app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/shared/layout.test.ts; npm run test:e2e -- e2e/restore.spec.ts`
Expected: unitário FAIL (import não resolve); E2E FAIL (abas não reaparecem).

- [ ] **Step 3: Implementar `src/shared/layout.ts`**

```ts
import type { LayoutState } from './models'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function sanitizeLayout(value: unknown): LayoutState | null {
  if (!isObject(value) || value.version !== 1 || !isObject(value.dock)) return null
  if (!isObject(value.dock.grid) || !isObject(value.dock.panels)) return null
  return { version: 1, dock: value.dock }
}
```

- [ ] **Step 4: Sanitizar em `handlers.ts`**

Em `src/main/ipc/handlers.ts`, adicionar import e trocar a linha de `layout:get`:

```ts
import { sanitizeLayout } from '@shared/layout'
```

```ts
    'layout:get': async () => sanitizeLayout(await d.stores.layout.read()),
```

- [ ] **Step 5: Implementar `layoutPersistence.ts`**

```ts
// src/renderer/src/dock/layoutPersistence.ts
import type { DockviewApi, SerializedDockview } from 'dockview-react'

export async function restoreLayout(api: DockviewApi): Promise<void> {
  const state = await window.api.invoke('layout:get')
  if (!state) return
  try {
    api.fromJSON(state.dock as SerializedDockview)
  } catch (err) {
    console.error('[next-ide] layout restore failed', err)
    api.clear()
  }
}

export function attachLayoutPersistence(api: DockviewApi): () => void {
  const save = () => void window.api.invoke('layout:save', { version: 1, dock: api.toJSON() })
  const layout = api.onDidLayoutChange(save)
  const removed = api.onDidRemovePanel(save)
  return () => {
    layout.dispose()
    removed.dispose()
  }
}
```

- [ ] **Step 6: Restaurar no `onReady` do `Dock.tsx`**

Em `src/renderer/src/dock/Dock.tsx`, adicionar import e, no fim do corpo do `onReady` (após os listeners `onDidAddPanel`/`onDidRemovePanel`), restaurar e só depois começar a salvar:

```ts
import { attachLayoutPersistence, restoreLayout } from './layoutPersistence'
```

```ts
    void restoreLayout(api).then(() => attachLayoutPersistence(api))
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test && npm run typecheck && npm run test:e2e`
Expected: unitários verdes (incl. 7 casos de `sanitizeLayout`); `5 passed` no E2E.

- [ ] **Step 8: Checagem manual**

Run: `npm run dev`. Montar layout com 3 grupos (agente + 2 terminais de projetos diferentes), Cmd+Q, `npm run dev` de novo: mesmo layout, terminais com shell novo no cwd certo.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: persist and restore dock layout"
```

---

### Task 12: Atalhos de dock e menu da aplicação

**Files:**
- Create: `src/renderer/src/dock/shortcuts.ts`, `src/renderer/src/dock/useDockShortcuts.ts`, `src/main/menu.ts`
- Modify: `src/renderer/src/App.tsx` (chamar hook), `src/main/index.ts` (instalar menu)
- Test: `test/renderer/shortcuts.test.ts`, `e2e/shortcuts.spec.ts`

**Interfaces:**
- Consumes: `useDock` (Task 8).
- Produces: `type ShortcutEvent`, `type DockCommand = { kind: 'split'; direction: 'right' | 'below' } | { kind: 'close' } | { kind: 'focusGroup'; index: number }`, `matchShortcut(e: ShortcutEvent): DockCommand | null`, `useDockShortcuts(): void`, `installMenu(): void`.

- [ ] **Step 1: Escrever testes falhando**

```ts
// test/renderer/shortcuts.test.ts
import { describe, expect, it } from 'vitest'
import { matchShortcut, type ShortcutEvent } from '@renderer/dock/shortcuts'

const ev = (over: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: '',
  code: '',
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
})

describe('matchShortcut', () => {
  it('Cmd+\\ splits right, Cmd+Shift+\\ splits below (US and ABNT2)', () => {
    expect(matchShortcut(ev({ key: '\\', code: 'Backslash' }))).toEqual({ kind: 'split', direction: 'right' })
    expect(matchShortcut(ev({ key: '|', code: 'Backslash', shiftKey: true }))).toEqual({
      kind: 'split',
      direction: 'below',
    })
    expect(matchShortcut(ev({ key: '\\', code: 'IntlBackslash' }))).toEqual({ kind: 'split', direction: 'right' })
  })

  it('Cmd+W closes', () => {
    expect(matchShortcut(ev({ key: 'w', code: 'KeyW' }))).toEqual({ kind: 'close' })
  })

  it('Cmd+1..9 focuses group', () => {
    expect(matchShortcut(ev({ key: '1', code: 'Digit1' }))).toEqual({ kind: 'focusGroup', index: 0 })
    expect(matchShortcut(ev({ key: '9', code: 'Digit9' }))).toEqual({ kind: 'focusGroup', index: 8 })
  })

  it('ignores without Cmd or with Ctrl/Alt', () => {
    expect(matchShortcut(ev({ key: 'w', metaKey: false }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', ctrlKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'w', altKey: true }))).toBeNull()
    expect(matchShortcut(ev({ key: 'k', code: 'KeyK' }))).toBeNull()
  })
})
```

```ts
// e2e/shortcuts.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('Cmd+\\ divide e Cmd+W fecha sem fechar a janela', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-keys-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await page.getByTestId('terminal').click()

  await page.keyboard.press('Meta+Backslash')
  await expect(page.getByTestId('panel-tab')).toHaveCount(2)
  await page.keyboard.press('Meta+w')
  await expect(page.getByTestId('panel-tab')).toHaveCount(1)
  expect(app.windows()).toHaveLength(1)
  await app.close()
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/renderer/shortcuts.test.ts; npm run test:e2e -- e2e/shortcuts.spec.ts`
Expected: unitário FAIL (import); E2E FAIL (segunda aba não aparece).

- [ ] **Step 3: Implementar `shortcuts.ts` e `useDockShortcuts.ts`**

```ts
// src/renderer/src/dock/shortcuts.ts
export type ShortcutEvent = {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type DockCommand =
  | { kind: 'split'; direction: 'right' | 'below' }
  | { kind: 'close' }
  | { kind: 'focusGroup'; index: number }

export function matchShortcut(e: ShortcutEvent): DockCommand | null {
  if (!e.metaKey || e.ctrlKey || e.altKey) return null
  if (e.code === 'Backslash' || e.code === 'IntlBackslash') {
    return { kind: 'split', direction: e.shiftKey ? 'below' : 'right' }
  }
  if (e.shiftKey) return null
  if (e.key.toLowerCase() === 'w') return { kind: 'close' }
  if (/^[1-9]$/.test(e.key)) return { kind: 'focusGroup', index: Number(e.key) - 1 }
  return null
}
```

```ts
// src/renderer/src/dock/useDockShortcuts.ts
import { useEffect } from 'react'
import { useDock } from './dockStore'
import { matchShortcut } from './shortcuts'

export function useDockShortcuts(): void {
  useEffect(() => {
    // Capture phase so shortcuts win over focused xterm/textarea handlers.
    const onKey = (e: KeyboardEvent) => {
      const cmd = matchShortcut(e)
      if (!cmd) return
      e.preventDefault()
      e.stopPropagation()
      const dock = useDock.getState()
      if (cmd.kind === 'split') dock.split(cmd.direction)
      else if (cmd.kind === 'close') dock.closeActive()
      else dock.focusGroup(cmd.index)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
```

- [ ] **Step 4: Chamar o hook no `App.tsx`**

```tsx
// src/renderer/src/App.tsx
import { Dock } from './dock/Dock'
import { useDockShortcuts } from './dock/useDockShortcuts'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  useDockShortcuts()
  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-neutral-950 text-neutral-200">
      <aside className="overflow-hidden border-r border-neutral-800" data-testid="sidebar">
        <Sidebar />
      </aside>
      <main className="min-w-0">
        <Dock />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Implementar `src/main/menu.ts` (sem Cmd+W de fechar janela)**

```ts
import { Menu, type MenuItemConstructorOptions } from 'electron'

export function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Janela', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

Em `src/main/index.ts`: adicionar `import { installMenu } from './menu'` e chamar `installMenu()` como primeira linha dentro de `app.whenReady().then(() => { ... })`.

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test && npm run typecheck && npm run test:e2e`
Expected: todos unitários verdes; `6 passed` no E2E.

- [ ] **Step 7: Checagem manual**

Run: `npm run dev`. Com foco no terminal: Cmd+\ (divide à direita), Cmd+Shift+\ (divide abaixo), Cmd+1/Cmd+2 (troca grupo), Cmd+W (fecha painel, janela fica), duplo clique na aba (maximiza/restaura), Cmd+C/Cmd+V funcionando no filtro da sidebar.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add dock keyboard shortcuts and app menu"
```

---

## Cobertura da spec neste plano

| Seção da spec | Coberto aqui | Fica para |
|---------------|--------------|-----------|
| §4 Stack | Task 1 | — |
| §5 Arquitetura, segurança renderer | Tasks 1, 7 | — |
| §5.2 Modelo de dados | Task 2 | — |
| §6 Painel Agente | placeholder (Task 8) | Plano 2 |
| §7 Sidebar: filtro de projetos, sessões ativas, workspaces, import, linha do projeto | Tasks 4, 9 | reordenar workspaces por drag → Plano 3 |
| §7 Árvore de arquivos, filtro de arquivos, Cmd+P | — | Plano 3 |
| §7 Branch | Task 5, 9 (atualiza em foco da janela) | watch de `.git/HEAD` no Plano 3 |
| §8 Dock: abas, cor, split, atalhos, maximizar | Tasks 8, 12 | confirmação de fechar agente rodando no Plano 2 |
| §9 Terminal | Tasks 6, 10 (addon search `Cmd+F` no Plano 3) | botão reiniciar após processo encerrado → Plano 3 |
| §10 FileViewer | — | Plano 3 |
| §11 IPC (canais de workspace/layout/settings/pty/git) | Task 7 | canais `agent:*` (Plano 2), `fs:list/read/index` (Plano 3) |
| §12 Persistência | Tasks 3, 7, 11 | histórico de agente no Plano 2 |
| §13 Erros: JSON corrompido, pasta sem acesso (git retorna null) | Tasks 3, 5 | demais no Planos 2/3 |
| §14 Testes | Vitest + Playwright em todas as tasks | — |
