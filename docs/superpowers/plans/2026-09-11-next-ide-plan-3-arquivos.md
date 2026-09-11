# next-ide — Plano 3: Arquivos (árvore, visualizador, Cmd+P, @ menções, caminhos clicáveis)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao next-ide navegação de arquivos: árvore por projeto na sidebar (gitignore, cores de git status, atualização ao vivo), visualizador somente leitura com destaque de sintaxe, busca rápida `Cmd+P`, menções `@arquivo` no composer do agente, caminhos clicáveis nos cartões de ferramentas — mais as pendências do Plano 1 (reiniciar terminal, `Cmd+F` no terminal, reordenar workspaces arrastando).

**Architecture:** Todo acesso a disco fica no main, num `FilesService` que só aceita caminhos dentro das pastas dos workspaces (checagem com `realpath`, contra escape por symlink). Um `WatcherManager` usa `fs.watch` recursivo por projeto e emite `fs:changed` / `git:changed` agregados em ~200 ms. O renderer guarda árvore, índice e git status num store (`filesStore`) e só renderiza. Destaque de sintaxe com `shiki` usando o motor de regex JavaScript (sem WebAssembly, então a CSP de produção não muda) e linguagens carregadas sob demanda.

**Tech Stack:** Base dos Planos 1 e 2 + `shiki@4.4.3`, `@shikijs/langs@4.4.3`, `@shikijs/themes@4.4.3`, `ignore@7.0.9`, `@xterm/addon-search@0.16.0` (todas `devDependencies`, empacotadas no renderer; `ignore` roda no main e também é empacotada).

**Spec:** `docs/superpowers/specs/2026-09-10-next-ide-mvp-design.md` (§7 Sidebar, §9 Terminal, §10 FileViewer, §6.2 caminho clicável, §6.3 `@` autocomplete, §11 IPC)

## Global Constraints

- Tudo dos Planos 1 e 2 continua valendo: renderer sandboxed, só `window.api`; preload expõe só canais de `INVOKE_CHANNELS`/`EVENT_CHANNELS`; `CONTRACT_COMPLETE` continua `true`.
- `dependencies` continuam só `node-pty` e `@anthropic-ai/claude-agent-sdk`. Bibliotecas novas vão em `devDependencies` com versão exata.
- **Nenhum caminho vindo do renderer é confiável.** Todo handler de arquivo resolve o caminho com `realpath` e só atende se ele estiver dentro de uma pasta de projeto dos workspaces salvos. Fora disso: `fs:read` devolve `{ kind: 'forbidden' }`, `fs:list` lança erro, `fs:index` / `git:status` devolvem vazio.
- A CSP de produção não muda: nada de `wasm-unsafe-eval` nem `file:`. Imagens do visualizador vão como `data:` (já permitido em `img-src`).
- Arquivos acima de 2 MB ou binários não são exibidos (spec §10).
- Watchers são fechados ao remover o projeto e ao sair do app.
- Testes nunca importam `electron`, `node-pty` nem o SDK; testes de arquivo usam diretórios temporários.
- E2E não clica em `<select>` nativo (usar `focus()` + `selectOption`).
- Textos de UI em pt-BR; código, identificadores e comentários em inglês.
- Todo commit termina com:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01F17eTjXSVXcv8vD4C4JpQi
  ```

## Fatos verificados (usar exatamente)

- `shiki@4.4.3` exporta `./core` (`createHighlighterCore(options): Promise<HighlighterCore>`) e `./engine/javascript` (`createJavaScriptRegexEngine(options?)`). `HighlighterCore` tem `codeToHtml(code, { lang, theme })`, `loadLanguage(...)`, `getLoadedLanguages()`. Linguagens: `@shikijs/langs/<nome>` (ex.: `typescript`, `tsx`, `javascript`, `jsx`, `json`, `markdown`, `css`, `html`, `python`, `go`, `rust`, `java`, `yaml`, `shellscript`, `sql`, `dockerfile`); temas: `@shikijs/themes/github-dark`. `lang: 'text'` renderiza sem destaque.
- `@xterm/addon-search@0.16.0`: `new SearchAddon()`, `findNext(term, options?): boolean`, `findPrevious(term, options?): boolean`, `clearDecorations()`, `onDidChangeResults` (só dispara quando `options.decorations` é passado).
- `ignore@7.0.9`: `ignore().add(text).ignores(relPosixPath)`; diretórios testados com `/` no fim.
- `git ls-files -co --exclude-standard -z` lista arquivos versionados e não ignorados; `git status --porcelain=v1 -z --untracked-files=all` dá o status (renomeação ocupa duas entradas).
- `fs.watch(root, { recursive: true })` funciona no macOS; o `filename` vem relativo à raiz.

## File Structure

```
src/shared/files.ts                 FsEntry, FileContent, GitFileStatus, MAX_VIEW_BYTES
src/shared/fuzzy.ts                 fuzzyScore / fuzzyFilter (puros)
src/main/fs/pathGuard.ts            isInside / resolveInsideRoots
src/main/fs/fsOps.ts                listDir, readViewable, loadIgnore
src/main/fs/projectIndex.ts         indexProject, parsePorcelainZ, gitStatus
src/main/fs/FilesService.ts         guarda + cache de ignore + list/read/index/status
src/main/fs/WatcherManager.ts       fs.watch por projeto → fs:changed / git:changed
src/renderer/src/stores/filesStore.ts  árvore, filhos, git status, índice, assinaturas
src/renderer/src/sidebar/FileTree.tsx, FileSearchResults.tsx
src/renderer/src/files/languages.ts    langForPath (puro)
src/renderer/src/files/highlighter.ts  shiki core + motor JS, linguagens sob demanda
src/renderer/src/panels/file/FilePanel.tsx
src/renderer/src/agent/mentions.ts     formatMention, triggerAt, applyMention, pickAgentPanel
src/renderer/src/dock/mention.ts       mentionInAgent
src/renderer/src/panels/agent/MentionMenu.tsx
src/renderer/src/panels/agent/agentPanelContext.ts, cards/FilePathLink.tsx
src/renderer/src/agent/toolLinks.ts    toolFileTarget, parseGrepLine
src/renderer/src/quickopen/QuickOpen.tsx, quickOpenStore.ts
test/... (Vitest)   e2e/files*.spec.ts, e2e/quickopen.spec.ts, e2e/terminal-extras.spec.ts, e2e/workspace-reorder.spec.ts
```

---

### Task 1: Dependências, guarda de caminho e operações de arquivo (main)

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `src/shared/files.ts`, `src/main/fs/pathGuard.ts`, `src/main/fs/fsOps.ts`
- Test: `test/main/pathGuard.test.ts`, `test/main/fsOps.test.ts`

**Interfaces:**
- Produces:
  - `src/shared/files.ts`: `type FsEntry = { name: string; path: string; kind: 'dir' | 'file' }`, `type GitFileStatus = 'M' | 'A' | 'D' | 'U' | 'R'`, `type FileContent = { kind: 'text'; text: string; size: number } | { kind: 'image'; dataUrl: string; size: number } | { kind: 'binary'; size: number } | { kind: 'too-large'; size: number } | { kind: 'missing' } | { kind: 'forbidden' }`, `MAX_VIEW_BYTES = 2 * 1024 * 1024`
  - `isInside(target: string, root: string): boolean`, `resolveInsideRoots(target: string, roots: string[]): Promise<string | null>`
  - `loadIgnore(root: string): Promise<Ignore>`, `listDir(dir: string, root: string, ig: Ignore): Promise<FsEntry[]>`, `readViewable(path: string): Promise<FileContent>`

- [ ] **Step 1: Instalar dependências**

```bash
npm install -D -E shiki@4.4.3 @shikijs/langs@4.4.3 @shikijs/themes@4.4.3 ignore@7.0.9 @xterm/addon-search@0.16.0
```

- [ ] **Step 2: Testes falhando**

```ts
// test/main/pathGuard.test.ts
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside, resolveInsideRoots } from '../../src/main/fs/pathGuard'

describe('isInside', () => {
  it('accepts the root and descendants, rejects siblings and parents', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true)
    expect(isInside('/a/b/c/d.ts', '/a/b')).toBe(true)
    expect(isInside('/a/bc', '/a/b')).toBe(false)
    expect(isInside('/a', '/a/b')).toBe(false)
    expect(isInside('/a/b/../x', '/a/b')).toBe(false)
  })
  it('does not confuse names that start with two dots with parent traversal', () => {
    expect(isInside('/a/b/..hidden', '/a/b')).toBe(true)
  })
})

describe('resolveInsideRoots', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'guard-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'guard-out-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'x')
    writeFileSync(join(outside, 'secret.txt'), 's')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))
    return { root, outside }
  }

  it('returns the real path for files inside a root', async () => {
    const { root } = setup()
    expect(await resolveInsideRoots(join(root, 'src', 'a.ts'), [root])).toMatch(/src\/a\.ts$/)
  })

  it('rejects relative paths, missing files, other folders and symlink escapes', async () => {
    const { root, outside } = setup()
    expect(await resolveInsideRoots('src/a.ts', [root])).toBeNull()
    expect(await resolveInsideRoots(join(root, 'nope.ts'), [root])).toBeNull()
    expect(await resolveInsideRoots(join(outside, 'secret.txt'), [root])).toBeNull()
    expect(await resolveInsideRoots(join(root, 'link.txt'), [root])).toBeNull()
  })
})
```

```ts
// test/main/fsOps.test.ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_VIEW_BYTES } from '@shared/files'
import { listDir, loadIgnore, readViewable } from '../../src/main/fs/fsOps'

function project() {
  const root = mkdtempSync(join(tmpdir(), 'fsops-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'dist'))
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.gitignore'), 'dist/\n*.log\n')
  writeFileSync(join(root, 'README.md'), '# oi')
  writeFileSync(join(root, 'debug.log'), 'x')
  writeFileSync(join(root, 'src', 'b.ts'), 'b')
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  return root
}

describe('listDir', () => {
  it('lists dirs first then files, hiding .git, node_modules and gitignored entries', async () => {
    const root = project()
    const ig = await loadIgnore(root)
    const entries = await listDir(root, root, ig)
    expect(entries.map((e) => `${e.kind}:${e.name}`)).toEqual(['dir:src', 'file:.gitignore', 'file:README.md'])
    expect((await listDir(join(root, 'src'), root, ig)).map((e) => e.name)).toEqual(['a.ts', 'b.ts'])
  })
})

describe('readViewable', () => {
  it('reads text, images as data URLs, and flags binary, too-large and missing files', async () => {
    const root = project()
    expect(await readViewable(join(root, 'README.md'))).toEqual({ kind: 'text', text: '# oi', size: 4 })
    writeFileSync(join(root, 'p.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(await readViewable(join(root, 'p.png'))).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,iVBORw==', size: 4 })
    writeFileSync(join(root, 'bin.dat'), Buffer.from([1, 0, 2]))
    expect(await readViewable(join(root, 'bin.dat'))).toEqual({ kind: 'binary', size: 3 })
    writeFileSync(join(root, 'big.txt'), Buffer.alloc(MAX_VIEW_BYTES + 1, 97))
    expect(await readViewable(join(root, 'big.txt'))).toEqual({ kind: 'too-large', size: MAX_VIEW_BYTES + 1 })
    expect(await readViewable(join(root, 'nope.txt'))).toEqual({ kind: 'missing' })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run test/main/pathGuard.test.ts test/main/fsOps.test.ts` → FAIL (imports).

- [ ] **Step 4: Implementar**

```ts
// src/shared/files.ts
export type FsEntry = { name: string; path: string; kind: 'dir' | 'file' }
export type GitFileStatus = 'M' | 'A' | 'D' | 'U' | 'R'
export type FileContent =
  | { kind: 'text'; text: string; size: number }
  | { kind: 'image'; dataUrl: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'too-large'; size: number }
  | { kind: 'missing' }
  | { kind: 'forbidden' }
export const MAX_VIEW_BYTES = 2 * 1024 * 1024
```

```ts
// src/main/fs/pathGuard.ts
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export function isInside(target: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  if (rel === '') return true
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}

/** Resolves symlinks on both sides so a link inside a project can't point outside it. */
export async function resolveInsideRoots(target: string, roots: string[]): Promise<string | null> {
  if (!isAbsolute(target)) return null
  let real: string
  try {
    real = await realpath(target)
  } catch {
    return null
  }
  for (const root of roots) {
    try {
      if (isInside(real, await realpath(root))) return real
    } catch {
      // root no longer exists — skip it
    }
  }
  return null
}
```

```ts
// src/main/fs/fsOps.ts
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { MAX_VIEW_BYTES, type FileContent, type FsEntry } from '@shared/files'

const ALWAYS_HIDDEN = new Set(['.git', 'node_modules', '.DS_Store'])
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

const toPosix = (p: string) => p.split(sep).join('/')

export async function loadIgnore(root: string): Promise<Ignore> {
  const ig = ignore()
  for (const file of ['.gitignore', join('.git', 'info', 'exclude')]) {
    try {
      ig.add(await readFile(join(root, file), 'utf8'))
    } catch {
      // file absent — nothing to add
    }
  }
  return ig
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function listDir(dir: string, root: string, ig: Ignore): Promise<FsEntry[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const out: FsEntry[] = []
  for (const d of dirents) {
    if (ALWAYS_HIDDEN.has(d.name)) continue
    const path = join(dir, d.name)
    const isDir = d.isDirectory() || (d.isSymbolicLink() && (await isDirectory(path)))
    const rel = toPosix(relative(root, path))
    if (rel && ig.ignores(isDir ? `${rel}/` : rel)) continue
    out.push({ name: d.name, path, kind: isDir ? 'dir' : 'file' })
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

export async function readViewable(path: string): Promise<FileContent> {
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return { kind: 'missing' }
  }
  if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
  const buf = await readFile(path)
  const mime = IMAGE_TYPES[extname(path).toLowerCase()]
  if (mime) return { kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size }
  if (buf.subarray(0, 8000).includes(0)) return { kind: 'binary', size }
  return { kind: 'text', text: buf.toString('utf8'), size }
}
```

- [ ] **Step 5: Verificar** — `npx vitest run test/main/pathGuard.test.ts test/main/fsOps.test.ts && npm run typecheck` → verde.

- [ ] **Step 6: Commit** — `git add package.json package-lock.json src/shared/files.ts src/main/fs test/main/pathGuard.test.ts test/main/fsOps.test.ts && git commit -m "feat: add workspace path guard and file listing/reading"`

---

### Task 2: Índice de arquivos, git status e busca fuzzy

**Files:**
- Create: `src/main/fs/projectIndex.ts`, `src/shared/fuzzy.ts`
- Test: `test/main/projectIndex.test.ts`, `test/shared/fuzzy.test.ts`

**Interfaces:**
- Consumes: `listDir`, `loadIgnore` (Task 1), `GitFileStatus` (Task 1).
- Produces:
  - `indexProject(root: string, limit?: number): Promise<string[]>` (caminhos relativos posix; git quando possível, senão varredura respeitando ignore)
  - `parsePorcelainZ(out: string): Record<string, GitFileStatus>`, `gitStatus(root: string): Promise<Record<string, GitFileStatus>>`
  - `fuzzyScore(query: string, candidate: string): number | null`, `fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string, limit?: number): T[]`

- [ ] **Step 1: Testes falhando**

```ts
// test/shared/fuzzy.test.ts
import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from '@shared/fuzzy'

describe('fuzzyScore', () => {
  it('returns null when characters are missing and a number otherwise', () => {
    expect(fuzzyScore('xyz', 'src/app.ts')).toBeNull()
    expect(fuzzyScore('app', 'src/app.ts')).toEqual(expect.any(Number))
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
  it('prefers matches in the file name over matches in folders', () => {
    const inName = fuzzyScore('tree', 'src/sidebar/FileTree.tsx')!
    const inFolder = fuzzyScore('tree', 'src/tree/index.ts')!
    expect(inName).toBeGreaterThan(inFolder)
  })
  it('is case-insensitive and rewards consecutive characters', () => {
    expect(fuzzyScore('READ', 'README.md')).not.toBeNull()
    expect(fuzzyScore('read', 'README.md')!).toBeGreaterThan(fuzzyScore('rdme', 'README.md')!)
  })
})

describe('fuzzyFilter', () => {
  it('filters, ranks and limits', () => {
    const items = ['src/main/index.ts', 'src/renderer/src/App.tsx', 'README.md', 'docs/app-notes.md']
    expect(fuzzyFilter('app', items, (s) => s)).toEqual(['src/renderer/src/App.tsx', 'docs/app-notes.md'])
    expect(fuzzyFilter('', items, (s) => s, 2)).toEqual(['src/main/index.ts', 'src/renderer/src/App.tsx'])
  })
})
```

```ts
// test/main/projectIndex.test.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitStatus, indexProject, parsePorcelainZ } from '../../src/main/fs/projectIndex'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

function project() {
  const root = mkdtempSync(join(tmpdir(), 'index-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, '.gitignore'), 'dist/\n')
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  writeFileSync(join(root, 'dist', 'out.js'), 'o')
  writeFileSync(join(root, 'README.md'), 'r')
  return root
}

describe('indexProject', () => {
  it('uses git ls-files in a repo (tracked + untracked, not ignored)', async () => {
    const root = project()
    git(root, 'init', '-q', '-b', 'main')
    expect((await indexProject(root)).sort()).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
  })
  it('walks the tree respecting .gitignore outside git, and honors the limit', async () => {
    const root = project()
    expect((await indexProject(root)).sort()).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
    expect(await indexProject(root, 1)).toHaveLength(1)
  })
})

describe('parsePorcelainZ', () => {
  it('maps XY codes and skips the original path of renames', () => {
    const out = ' M src/a.ts\0A  new.ts\0?? tmp.txt\0 D gone.ts\0R  moved.ts\0old.ts\0'
    expect(parsePorcelainZ(out)).toEqual({ 'src/a.ts': 'M', 'new.ts': 'A', 'tmp.txt': 'U', 'gone.ts': 'D', 'moved.ts': 'R' })
  })
})

describe('gitStatus', () => {
  it('returns statuses for a repo and {} outside git', async () => {
    const root = project()
    expect(await gitStatus(root)).toEqual({})
    git(root, 'init', '-q', '-b', 'main')
    expect(await gitStatus(root)).toMatchObject({ 'src/a.ts': 'U', 'README.md': 'U' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/shared/fuzzy.test.ts test/main/projectIndex.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/shared/fuzzy.ts
const WORD_START = new Set(['/', '.', '-', '_', ' '])

/** Subsequence match; higher is better. Bonuses: consecutive chars, file-name chars, word starts. */
export function fuzzyScore(query: string, candidate: string): number | null {
  const q = query.toLowerCase()
  if (!q) return 0
  const c = candidate.toLowerCase()
  const nameStart = c.lastIndexOf('/') + 1
  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    const found = c.indexOf(ch, from)
    if (found < 0) return null
    score += found === prev + 1 ? 5 : 1
    if (found >= nameStart) score += 2
    if (found === 0 || WORD_START.has(c[found - 1]!)) score += 3
    prev = found
    from = found + 1
  }
  return score - (c.length - q.length) * 0.01
}

export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string, limit = 50): T[] {
  if (!query) return items.slice(0, limit)
  return items
    .map((item) => ({ item, score: fuzzyScore(query, key(item)) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item)
}
```

```ts
// src/main/fs/projectIndex.ts
import { execFile } from 'node:child_process'
import { relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { GitFileStatus } from '@shared/files'
import { listDir, loadIgnore } from './fsOps'

const exec = promisify(execFile)
const toPosix = (p: string) => p.split(sep).join('/')

export async function indexProject(root: string, limit = 20_000): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout.split('\0').filter(Boolean).slice(0, limit)
  } catch {
    const ig = await loadIgnore(root)
    const out: string[] = []
    const queue = [root]
    while (queue.length > 0 && out.length < limit) {
      const dir = queue.shift()!
      let entries
      try {
        entries = await listDir(dir, root, ig)
      } catch {
        continue
      }
      for (const e of entries) {
        if (e.kind === 'dir') queue.push(e.path)
        else if (out.length < limit) out.push(toPosix(relative(root, e.path)))
      }
    }
    return out
  }
}

export function parsePorcelainZ(out: string): Record<string, GitFileStatus> {
  const entries = out.split('\0')
  const result: Record<string, GitFileStatus> = {}
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.length < 4) continue
    const x = entry[0]!
    const y = entry[1]!
    const path = entry.slice(3)
    if (x === 'R' || x === 'C') i++ // the next entry is the original path
    if (x === '?' && y === '?') result[path] = 'U'
    else if (x === 'R') result[path] = 'R'
    else if (x === 'A' || y === 'A') result[path] = 'A'
    else if (x === 'D' || y === 'D') result[path] = 'D'
    else result[path] = 'M'
  }
  return result
}

export async function gitStatus(root: string): Promise<Record<string, GitFileStatus>> {
  try {
    const { stdout } = await exec('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return parsePorcelainZ(stdout)
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Verificar** — `npx vitest run test/shared/fuzzy.test.ts test/main/projectIndex.test.ts && npm run typecheck` → verde.

- [ ] **Step 5: Commit** — `git add src/shared/fuzzy.ts src/main/fs/projectIndex.ts test/shared/fuzzy.test.ts test/main/projectIndex.test.ts && git commit -m "feat: add project file index, git status parsing and fuzzy matching"`

---

### Task 3: FilesService, WatcherManager e canais IPC

**Files:**
- Create: `src/main/fs/FilesService.ts`, `src/main/fs/WatcherManager.ts`
- Modify: `src/shared/ipc-contract.ts`, `src/shared/workspaces.ts`, `src/main/ipc/handlers.ts`, `src/main/index.ts`
- Test: `test/main/FilesService.test.ts`, `test/main/WatcherManager.test.ts`, `test/main/handlers.test.ts`, `test/shared/workspaces.test.ts`

**Interfaces:**
- Consumes: `resolveInsideRoots`, `isInside` (Task 1), `listDir`, `loadIgnore`, `readViewable` (Task 1), `indexProject`, `gitStatus` (Task 2).
- Produces:
  - Invoke: `'fs:list': [projectPath, dir] → FsEntry[]`, `'fs:read': [path] → FileContent`, `'fs:index': [projectPath] → string[]`, `'git:status': [projectPath] → Record<string, GitFileStatus>`
  - Eventos: `'fs:changed': [projectPath: string, paths: string[]]` (caminhos absolutos; `paths` contendo o próprio `projectPath` = "mudou algo, recarregue tudo"), `'git:changed': [projectPath: string]`
  - `uniqueProjects(list: Workspace[]): Project[]` (sem repetir `path`), `projectPaths(list: Workspace[]): string[]`, `moveWorkspaceById(list, id, targetId): Workspace[]` em `@shared/workspaces`
  - `class FilesService(roots: () => Promise<string[]>)` com `list`, `read`, `index`, `status`, `invalidateIgnore(projectPath)`
  - `class WatcherManager(watch: WatchFn, emit: WatchEmitter, debounceMs = 200)` com `sync(roots: string[])`, `closeAll()`; `classifyChange(rel: string | null): 'fs' | 'git' | 'ignore'`
  - `HandlerDeps` ganha `files: Pick<FilesService, 'list' | 'read' | 'index' | 'status'>` e `onWorkspaces: (workspaces: Workspace[]) => void`

- [ ] **Step 1: Testes falhando**

```ts
// acrescentar em test/shared/workspaces.test.ts (importar moveWorkspaceById, projectPaths, uniqueProjects)
describe('project helpers', () => {
  const list = [
    { id: 'w1', name: 'a', collapsed: false, projects: [{ id: 'p1', name: 'api', path: '/x/api' }, { id: 'p2', name: 'ui', path: '/x/ui' }] },
    { id: 'w2', name: 'b', collapsed: false, projects: [{ id: 'p3', name: 'api', path: '/x/api' }] },
  ]
  it('uniqueProjects / projectPaths drop repeated paths', () => {
    expect(uniqueProjects(list).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(projectPaths(list)).toEqual(['/x/api', '/x/ui'])
  })
  it('moveWorkspaceById moves the dragged workspace to the target index', () => {
    expect(moveWorkspaceById(list, 'w2', 'w1').map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(moveWorkspaceById(list, 'nope', 'w1')).toBe(list)
  })
})
```

```ts
// test/main/FilesService.test.ts
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FilesService } from '../../src/main/fs/FilesService'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'files-'))
  const outside = mkdtempSync(join(tmpdir(), 'files-out-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'a')
  writeFileSync(join(root, '.gitignore'), 'secret.txt\n')
  writeFileSync(join(root, 'secret.txt'), 's')
  writeFileSync(join(outside, 'x.txt'), 'x')
  symlinkSync(join(outside, 'x.txt'), join(root, 'link.txt'))
  return { root, outside, files: new FilesService(async () => [root]) }
}

describe('FilesService', () => {
  it('lists dirs of a known project, keeping the caller-provided path prefix', async () => {
    const { root, files } = setup()
    const entries = await files.list(root, root)
    expect(entries.map((e) => e.name)).toEqual(['src', '.gitignore', 'link.txt'])
    expect(entries[0]!.path).toBe(join(root, 'src'))
  })

  it('refuses to list unknown projects or dirs outside the project', async () => {
    const { root, outside, files } = setup()
    await expect(files.list(outside, outside)).rejects.toThrow('fora')
    await expect(files.list(root, outside)).rejects.toThrow('fora')
  })

  it('reads files inside roots and refuses the rest', async () => {
    const { root, outside, files } = setup()
    expect(await files.read(join(root, 'src', 'a.ts'))).toMatchObject({ kind: 'text', text: 'a' })
    expect(await files.read(join(root, 'gone.ts'))).toEqual({ kind: 'missing' })
    expect(await files.read(join(outside, 'x.txt'))).toEqual({ kind: 'forbidden' })
    expect(await files.read(join(root, 'link.txt'))).toEqual({ kind: 'forbidden' })
    expect(await files.read('src/a.ts')).toEqual({ kind: 'forbidden' })
  })

  it('indexes and reports status only for known projects', async () => {
    const { root, outside, files } = setup()
    expect((await files.index(root)).sort()).toEqual(['.gitignore', 'link.txt', 'src/a.ts'])
    expect(await files.index(outside)).toEqual([])
    expect(await files.status(outside)).toEqual({})
  })

  it('re-reads .gitignore after invalidateIgnore', async () => {
    const { root, files } = setup()
    expect((await files.list(root, root)).map((e) => e.name)).not.toContain('secret.txt')
    writeFileSync(join(root, '.gitignore'), '')
    files.invalidateIgnore(root)
    expect((await files.list(root, root)).map((e) => e.name)).toContain('secret.txt')
  })
})
```

```ts
// test/main/WatcherManager.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyChange, WatcherManager, type WatchFn } from '../../src/main/fs/WatcherManager'

describe('classifyChange', () => {
  it('routes working tree, git metadata and noise', () => {
    expect(classifyChange('src/a.ts')).toBe('fs')
    expect(classifyChange(null)).toBe('fs')
    expect(classifyChange('.git/HEAD')).toBe('git')
    expect(classifyChange('.git/index')).toBe('git')
    expect(classifyChange('.git/refs/heads/main')).toBe('git')
    expect(classifyChange('.git/objects/ab/cdef')).toBe('ignore')
    expect(classifyChange('node_modules/x/index.js')).toBe('ignore')
    expect(classifyChange('pkg/node_modules/x.js')).toBe('ignore')
  })
})

describe('WatcherManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const handlers = new Map<string, (rel: string | null) => void>()
    const closed: string[] = []
    const watch: WatchFn = (root, onChange) => {
      handlers.set(root, onChange)
      return { close: () => closed.push(root) }
    }
    const fsChanged = vi.fn()
    const gitChanged = vi.fn()
    const mgr = new WatcherManager(watch, { fsChanged, gitChanged }, 200)
    return { mgr, handlers, closed, fsChanged, gitChanged }
  }

  it('debounces changes per project into one fs:changed and one git:changed', () => {
    const { mgr, handlers, fsChanged, gitChanged } = setup()
    mgr.sync(['/p'])
    handlers.get('/p')!('src/a.ts')
    handlers.get('/p')!('src/b.ts')
    handlers.get('/p')!('.git/objects/zz')
    expect(fsChanged).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fsChanged).toHaveBeenCalledWith('/p', ['/p/src/a.ts', '/p/src/b.ts'])
    expect(gitChanged).toHaveBeenCalledTimes(1)
  })

  it('emits only git:changed for git metadata and the project root for unknown changes', () => {
    const { mgr, handlers, fsChanged, gitChanged } = setup()
    mgr.sync(['/p'])
    handlers.get('/p')!('.git/HEAD')
    vi.advanceTimersByTime(200)
    expect(fsChanged).not.toHaveBeenCalled()
    expect(gitChanged).toHaveBeenCalledWith('/p')
    handlers.get('/p')!(null)
    vi.advanceTimersByTime(200)
    expect(fsChanged).toHaveBeenCalledWith('/p', ['/p'])
  })

  it('opens new roots, closes removed ones, and closeAll cancels pending emits', () => {
    const { mgr, handlers, closed, fsChanged } = setup()
    mgr.sync(['/a', '/b'])
    mgr.sync(['/b', '/c'])
    expect(closed).toEqual(['/a'])
    expect([...handlers.keys()]).toEqual(['/a', '/b', '/c'])
    handlers.get('/b')!('x.ts')
    mgr.closeAll()
    vi.advanceTimersByTime(200)
    expect(fsChanged).not.toHaveBeenCalled()
    expect(closed.sort()).toEqual(['/a', '/b', '/c'])
  })

  it('survives a watch function that throws', () => {
    const fsChanged = vi.fn()
    const mgr = new WatcherManager(() => { throw new Error('ENOENT') }, { fsChanged, gitChanged: vi.fn() })
    expect(() => mgr.sync(['/gone'])).not.toThrow()
  })
})
```

```ts
// acrescentar em test/main/handlers.test.ts — em deps(), adicionar:
//   files: {
//     list: async (p, d) => [{ name: 'a.ts', path: `${d}/a.ts`, kind: 'file' }],
//     read: async () => ({ kind: 'missing' }),
//     index: async () => ['a.ts'],
//     status: async () => ({ 'a.ts': 'M' }),
//   },
//   onWorkspaces: () => undefined,
it('fs and git:status channels delegate to FilesService', async () => {
  const h = buildHandlers(deps())
  expect(await h['fs:list']('/p', '/p')).toEqual([{ name: 'a.ts', path: '/p/a.ts', kind: 'file' }])
  expect(await h['fs:read']('/p/a.ts')).toEqual({ kind: 'missing' })
  expect(await h['fs:index']('/p')).toEqual(['a.ts'])
  expect(await h['git:status']('/p')).toEqual({ 'a.ts': 'M' })
})

it('workspace:save reports the new workspaces so watchers and roots follow', async () => {
  const onWorkspaces = vi.fn()
  const h = buildHandlers(deps({ onWorkspaces }))
  const ws = [{ id: 'w', name: 'x', projects: [{ id: 'p', name: 'p', path: '/p' }], collapsed: false }]
  await h['workspace:save'](ws)
  expect(onWorkspaces).toHaveBeenCalledWith(ws)
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/main/FilesService.test.ts test/main/WatcherManager.test.ts test/main/handlers.test.ts test/shared/workspaces.test.ts` → FAIL.

- [ ] **Step 3: Contrato IPC** — em `src/shared/ipc-contract.ts`:

```ts
import type { FileContent, FsEntry, GitFileStatus } from './files'
// InvokeMap:
  'fs:list': { args: [projectPath: string, dir: string]; result: FsEntry[] }
  'fs:read': { args: [path: string]; result: FileContent }
  'fs:index': { args: [projectPath: string]; result: string[] }
  'git:status': { args: [projectPath: string]; result: Record<string, GitFileStatus> }
// EventMap:
  'fs:changed': [projectPath: string, paths: string[]]
  'git:changed': [projectPath: string]
// INVOKE_CHANNELS: acrescentar 'fs:list', 'fs:read', 'fs:index', 'git:status'
// EVENT_CHANNELS: ['pty:data', 'pty:exit', 'agent:event', 'fs:changed', 'git:changed']
```

- [ ] **Step 4: Helpers de workspace** — em `src/shared/workspaces.ts`:

```ts
export function uniqueProjects(list: Workspace[]): Project[] {
  const seen = new Set<string>()
  const out: Project[] = []
  for (const w of list) {
    for (const p of w.projects) {
      if (seen.has(p.path)) continue
      seen.add(p.path)
      out.push(p)
    }
  }
  return out
}

export const projectPaths = (list: Workspace[]): string[] => uniqueProjects(list).map((p) => p.path)

export function moveWorkspaceById(list: Workspace[], id: string, targetId: string): Workspace[] {
  return moveWorkspace(list, list.findIndex((w) => w.id === id), list.findIndex((w) => w.id === targetId))
}
```

- [ ] **Step 5: FilesService**

```ts
// src/main/fs/FilesService.ts
import { lstat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { Ignore } from 'ignore'
import type { FileContent, FsEntry, GitFileStatus } from '@shared/files'
import { listDir, loadIgnore, readViewable } from './fsOps'
import { isInside, resolveInsideRoots } from './pathGuard'
import { gitStatus, indexProject } from './projectIndex'

/**
 * Every file request from the renderer goes through here. Paths are validated against the
 * workspace project folders (lexically and after realpath) but served under the caller's own
 * spelling, so a project added as /var/... keeps /var/... paths even though realpath is /private/var/....
 */
export class FilesService {
  private readonly ignores = new Map<string, Promise<Ignore>>()

  constructor(private readonly roots: () => Promise<string[]>) {}

  private async isProject(projectPath: string): Promise<boolean> {
    return (await this.roots()).includes(projectPath)
  }

  private ignoreFor(projectPath: string): Promise<Ignore> {
    let ig = this.ignores.get(projectPath)
    if (!ig) {
      ig = loadIgnore(projectPath)
      this.ignores.set(projectPath, ig)
    }
    return ig
  }

  invalidateIgnore(projectPath: string): void {
    this.ignores.delete(projectPath)
  }

  async list(projectPath: string, dir: string): Promise<FsEntry[]> {
    const abs = resolve(dir)
    const ok =
      isAbsolute(dir) &&
      (await this.isProject(projectPath)) &&
      isInside(abs, projectPath) &&
      (await resolveInsideRoots(abs, [projectPath])) !== null
    if (!ok) throw new Error('Pasta fora do projeto.')
    return listDir(abs, projectPath, await this.ignoreFor(projectPath))
  }

  async read(path: string): Promise<FileContent> {
    if (!isAbsolute(path)) return { kind: 'forbidden' }
    const abs = resolve(path)
    const roots = await this.roots()
    if (!roots.some((r) => isInside(abs, r))) return { kind: 'forbidden' }
    if (!(await resolveInsideRoots(abs, roots))) {
      try {
        await lstat(abs)
        return { kind: 'forbidden' } // exists, but resolves outside (symlink escape)
      } catch {
        return { kind: 'missing' }
      }
    }
    return readViewable(abs)
  }

  async index(projectPath: string): Promise<string[]> {
    return (await this.isProject(projectPath)) ? indexProject(projectPath) : []
  }

  async status(projectPath: string): Promise<Record<string, GitFileStatus>> {
    return (await this.isProject(projectPath)) ? gitStatus(projectPath) : {}
  }
}
```

- [ ] **Step 6: WatcherManager**

```ts
// src/main/fs/WatcherManager.ts
import { join, sep } from 'node:path'

export type WatchHandle = { close(): void }
/** `rel` is relative to `root`; null when the OS didn't say which file changed. */
export type WatchFn = (root: string, onChange: (rel: string | null) => void) => WatchHandle
export type WatchEmitter = {
  fsChanged(projectPath: string, paths: string[]): void
  gitChanged(projectPath: string): void
}

export function classifyChange(rel: string | null): 'fs' | 'git' | 'ignore' {
  if (rel === null) return 'fs'
  const parts = rel.split(sep).join('/').split('/')
  if (parts[0] === '.git') {
    const p = parts.join('/')
    return p === '.git/HEAD' || p === '.git/index' || p.startsWith('.git/refs/') ? 'git' : 'ignore'
  }
  return parts.includes('node_modules') ? 'ignore' : 'fs'
}

type Entry = { handle: WatchHandle; timer: ReturnType<typeof setTimeout> | null; paths: Set<string>; git: boolean }

export class WatcherManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly watch: WatchFn,
    private readonly emit: WatchEmitter,
    private readonly debounceMs = 200,
  ) {}

  sync(roots: string[]): void {
    const wanted = new Set(roots)
    for (const root of [...this.entries.keys()]) if (!wanted.has(root)) this.close(root)
    for (const root of wanted) if (!this.entries.has(root)) this.open(root)
  }

  closeAll(): void {
    for (const root of [...this.entries.keys()]) this.close(root)
  }

  private open(root: string): void {
    try {
      const entry: Entry = { handle: { close: () => undefined }, timer: null, paths: new Set(), git: false }
      entry.handle = this.watch(root, (rel) => this.onChange(root, rel))
      this.entries.set(root, entry)
    } catch (err) {
      console.error('[next-ide] failed to watch', root, err)
    }
  }

  private close(root: string): void {
    const entry = this.entries.get(root)
    if (!entry) return
    this.entries.delete(root)
    if (entry.timer) clearTimeout(entry.timer)
    try {
      entry.handle.close()
    } catch (err) {
      console.error('[next-ide] failed to close watcher', root, err)
    }
  }

  private onChange(root: string, rel: string | null): void {
    const entry = this.entries.get(root)
    const kind = classifyChange(rel)
    if (!entry || kind === 'ignore') return
    if (kind === 'fs') entry.paths.add(rel === null ? root : join(root, rel))
    // Any working-tree change can change `git status`; git metadata changes can change the branch.
    entry.git = true
    entry.timer ??= setTimeout(() => this.flush(root), this.debounceMs)
  }

  private flush(root: string): void {
    const entry = this.entries.get(root)
    if (!entry) return
    entry.timer = null
    const paths = [...entry.paths]
    entry.paths.clear()
    const git = entry.git
    entry.git = false
    if (paths.length > 0) this.emit.fsChanged(root, paths)
    if (git) this.emit.gitChanged(root)
  }
}
```

- [ ] **Step 7: Handlers** — em `src/main/ipc/handlers.ts`:

```ts
import type { Workspace } from '@shared/models'
import type { FilesService } from '../fs/FilesService'
// HandlerDeps:
  files: Pick<FilesService, 'list' | 'read' | 'index' | 'status'>
  onWorkspaces: (workspaces: Workspace[]) => void
// buildHandlers:
    'workspace:save': (workspaces) => {
      d.onWorkspaces(workspaces)
      return d.stores.workspaces.schedule(workspaces)
    },
    'fs:list': (projectPath, dir) => d.files.list(projectPath, dir),
    'fs:read': (path) => d.files.read(path),
    'fs:index': (projectPath) => d.files.index(projectPath),
    'git:status': (projectPath) => d.files.status(projectPath),
```

Atualizar `deps()` em `test/main/handlers.test.ts` com os campos `files` e `onWorkspaces` mostrados no Step 1.

- [ ] **Step 8: Ligar no main** — em `src/main/index.ts`:

```ts
import { watch } from 'node:fs'
import { basename } from 'node:path'
import { projectPaths } from '@shared/workspaces'
import { FilesService } from './fs/FilesService'
import { WatcherManager, type WatchFn } from './fs/WatcherManager'

// Project folders the renderer may read. Kept in memory (not re-read from the debounced
// store) so a folder added a moment ago is readable right away.
let roots: string[] = []
let rootsReady: Promise<void> = Promise.resolve()

const files = new FilesService(async () => {
  await rootsReady
  return roots
})

const watchFs: WatchFn = (root, onChange) => {
  const watcher = watch(root, { recursive: true }, (_event, filename) => onChange(filename ? filename.toString() : null))
  watcher.on('error', (err) => console.error('[next-ide] watcher error', root, err))
  return watcher
}

const watchers = new WatcherManager(watchFs, {
  fsChanged: (projectPath, paths) => {
    if (paths.some((p) => p === projectPath || basename(p) === '.gitignore')) files.invalidateIgnore(projectPath)
    send('fs:changed', projectPath, paths)
  },
  gitChanged: (projectPath) => send('git:changed', projectPath),
})

function setProjects(paths: string[]): void {
  roots = paths
  watchers.sync(paths)
}

rootsReady = stores.workspaces
  .read()
  .then((ws) => setProjects(projectPaths(ws)))
  .catch((err) => console.error('[next-ide] failed to read workspaces for file access', err))
```

Colar o bloco acima logo depois da criação de `ptys`, nessa ordem. Em `buildHandlers({...})` passar `files` e `onWorkspaces: (ws) => setProjects(projectPaths(ws))`. Em `before-quit`, junto de `ptys.killAll()`:

```ts
  try {
    watchers.closeAll()
  } catch (err) {
    console.error('[next-ide] closing watchers failed', err)
  }
```

- [ ] **Step 9: Verificar** — `npx vitest run && npm run typecheck` → verde.

- [ ] **Step 10: Commit** — `git add -A src/shared src/main test && git commit -m "feat: add guarded file IPC and project watchers"`

---

### Task 4: Árvore de arquivos na sidebar

**Files:**
- Create: `src/renderer/src/files/tree.ts`, `src/renderer/src/stores/filesStore.ts`, `src/renderer/src/sidebar/FileTree.tsx`, `src/renderer/src/sidebar/FileSearchResults.tsx`
- Modify: `src/shared/workspaces.ts` (`filterWorkspaces` com `keep`), `src/renderer/src/sidebar/ProjectRow.tsx`, `src/renderer/src/sidebar/Sidebar.tsx`, `src/renderer/src/sidebar/useGitBranch.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/dock/dockStore.ts` (só a assinatura `openFile`, implementada na Task 5 — aqui um stub que chama `open`)
- Test: `test/renderer/tree.test.ts`, `test/renderer/filesStore.test.ts`, `test/shared/workspaces.test.ts`, `e2e/files-tree.spec.ts`

**Interfaces:**
- Consumes: canais `fs:list`, `fs:index`, `git:status`, eventos `fs:changed`, `git:changed` (Task 3); `fuzzyFilter` (Task 2); `FsEntry`, `GitFileStatus` (Task 1).
- Produces:
  - `isUnder(path, root): boolean`, `relPath(root, path): string`, `dirsToReload(projectPath, loadedDirs, changed): string[]`, `entryStatus(status, projectPath, entry): GitFileStatus | undefined`, `STATUS_CLASS: Record<GitFileStatus, string>` em `files/tree.ts`
  - `useFiles` (zustand): `expanded: Record<string, true>`, `children: Record<string, FsEntry[]>`, `errors: Record<string, string>`, `status: Record<string, Record<string, GitFileStatus>>`, `indexes: Record<string, string[]>`, `toggleDir(projectPath, dir)`, `loadDir(projectPath, dir)`, `refreshStatus(projectPath)`, `ensureIndex(projectPath): Promise<string[]>`, `handleFsChanged(projectPath, paths)`, `handleGitChanged(projectPath)`; `subscribeFileEvents(): void`
  - `useDock.openFile(params: FilePanelParams): void`
  - `filterWorkspaces(list, query, keep?: (p: Project) => boolean)`

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/tree.test.ts
import { describe, expect, it } from 'vitest'
import { dirsToReload, entryStatus, isUnder, relPath } from '@renderer/files/tree'

describe('tree helpers', () => {
  it('isUnder / relPath work on posix prefixes without false siblings', () => {
    expect(isUnder('/p/src/a.ts', '/p')).toBe(true)
    expect(isUnder('/p', '/p')).toBe(true)
    expect(isUnder('/px/a.ts', '/p')).toBe(false)
    expect(relPath('/p', '/p/src/a.ts')).toBe('src/a.ts')
    expect(relPath('/p', '/p')).toBe('')
  })

  it('dirsToReload picks loaded parents of changed paths, or everything for a root change', () => {
    const loaded = ['/p', '/p/src', '/p/src/deep', '/q']
    expect(dirsToReload('/p', loaded, ['/p/src/a.ts'])).toEqual(['/p/src'])
    expect(dirsToReload('/p', loaded, ['/p/src/deep'])).toEqual(['/p/src', '/p/src/deep'])
    expect(dirsToReload('/p', loaded, ['/p/other/x.ts'])).toEqual([])
    expect(dirsToReload('/p', loaded, ['/p'])).toEqual(['/p', '/p/src', '/p/src/deep'])
  })

  it('entryStatus: exact for files, dirty marker for folders containing changes', () => {
    const status = { 'src/a.ts': 'M' as const, 'README.md': 'U' as const }
    expect(entryStatus(status, '/p', { name: 'a.ts', path: '/p/src/a.ts', kind: 'file' })).toBe('M')
    expect(entryStatus(status, '/p', { name: 'src', path: '/p/src', kind: 'dir' })).toBe('M')
    expect(entryStatus(status, '/p', { name: 'lib', path: '/p/lib', kind: 'dir' })).toBeUndefined()
    expect(entryStatus(undefined, '/p', { name: 'a.ts', path: '/p/src/a.ts', kind: 'file' })).toBeUndefined()
  })
})
```

```ts
// test/renderer/filesStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFiles } from '@renderer/stores/filesStore'

const invoke = vi.fn()
vi.stubGlobal('window', { api: { invoke, on: vi.fn(() => () => undefined) } })

describe('filesStore', () => {
  beforeEach(() => {
    invoke.mockReset()
    useFiles.setState({ expanded: {}, children: {}, errors: {}, status: {}, indexes: {} })
  })

  it('expanding a project root loads its children and git status', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'fs:list') return [{ name: 'a.ts', path: '/p/a.ts', kind: 'file' }]
      if (channel === 'git:status') return { 'a.ts': 'U' }
      return null
    })
    useFiles.getState().toggleDir('/p', '/p')
    await vi.waitFor(() => expect(useFiles.getState().children['/p']).toHaveLength(1))
    await vi.waitFor(() => expect(useFiles.getState().status['/p']).toEqual({ 'a.ts': 'U' }))
    expect(useFiles.getState().expanded['/p']).toBe(true)
    useFiles.getState().toggleDir('/p', '/p')
    expect(useFiles.getState().expanded['/p']).toBeUndefined()
  })

  it('records list errors per dir', async () => {
    invoke.mockRejectedValue(new Error('Pasta fora do projeto.'))
    await useFiles.getState().loadDir('/p', '/p')
    expect(useFiles.getState().errors['/p']).toContain('Pasta fora do projeto.')
  })

  it('ensureIndex caches and shares the in-flight request; fs changes drop the cache', async () => {
    invoke.mockResolvedValue(['a.ts'])
    const [a, b] = await Promise.all([useFiles.getState().ensureIndex('/p'), useFiles.getState().ensureIndex('/p')])
    expect(a).toEqual(['a.ts'])
    expect(b).toEqual(['a.ts'])
    expect(invoke).toHaveBeenCalledTimes(1)
    useFiles.getState().handleFsChanged('/p', ['/p/b.ts'])
    expect(useFiles.getState().indexes['/p']).toBeUndefined()
  })

  it('fs changes reload only loaded parent dirs', async () => {
    useFiles.setState({ children: { '/p': [], '/p/src': [] } })
    invoke.mockResolvedValue([])
    useFiles.getState().handleFsChanged('/p', ['/p/src/new.ts'])
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('fs:list', '/p', '/p/src'))
    expect(invoke).not.toHaveBeenCalledWith('fs:list', '/p', '/p')
  })

  it('git changes refresh status only for projects that loaded it', async () => {
    useFiles.setState({ status: { '/p': {} } })
    invoke.mockResolvedValue({ 'x.ts': 'M' })
    useFiles.getState().handleGitChanged('/q')
    expect(invoke).not.toHaveBeenCalled()
    useFiles.getState().handleGitChanged('/p')
    await vi.waitFor(() => expect(useFiles.getState().status['/p']).toEqual({ 'x.ts': 'M' }))
  })
})
```

```ts
// acrescentar em test/shared/workspaces.test.ts
it('filterWorkspaces keeps projects accepted by keep() even when the name does not match', () => {
  const out = filterWorkspaces(sample(), 'zzz', (p) => p.id === 'p2')
  expect(out).toHaveLength(1)
  expect(out[0]!.projects.map((p) => p.id)).toEqual(['p2'])
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/tree.test.ts test/renderer/filesStore.test.ts test/shared/workspaces.test.ts` → FAIL.

- [ ] **Step 3: `filterWorkspaces` com `keep`** — em `src/shared/workspaces.ts`:

```ts
export function filterWorkspaces(list: Workspace[], query: string, keep: (p: Project) => boolean = () => false): Workspace[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.flatMap((w) => {
    if (w.name.toLowerCase().includes(q)) return [{ ...w, collapsed: false }]
    const projects = w.projects.filter((p) => keep(p) || p.name.toLowerCase().includes(q))
    return projects.length ? [{ ...w, projects, collapsed: false }] : []
  })
}
```

- [ ] **Step 4: Helpers puros**

```ts
// src/renderer/src/files/tree.ts
import type { FsEntry, GitFileStatus } from '@shared/files'

export const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`)
export const relPath = (root: string, path: string): string => (path === root ? '' : isUnder(path, root) ? path.slice(root.length + 1) : path)
const dirname = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '/'

/** Which already-loaded folders need a fresh `fs:list` after these paths changed. */
export function dirsToReload(projectPath: string, loadedDirs: string[], changed: string[]): string[] {
  const loaded = loadedDirs.filter((d) => isUnder(d, projectPath))
  if (changed.includes(projectPath)) return loaded
  const hit = new Set<string>()
  for (const c of changed) {
    hit.add(dirname(c))
    hit.add(c) // a loaded folder that was itself renamed/removed
  }
  return loaded.filter((d) => hit.has(d))
}

export function entryStatus(
  status: Record<string, GitFileStatus> | undefined,
  projectPath: string,
  entry: FsEntry,
): GitFileStatus | undefined {
  if (!status) return undefined
  const rel = relPath(projectPath, entry.path)
  if (entry.kind === 'file') return status[rel]
  const prefix = `${rel}/`
  return Object.keys(status).some((k) => k.startsWith(prefix)) ? 'M' : undefined
}

export const STATUS_CLASS: Record<GitFileStatus, string> = {
  M: 'text-amber-300',
  A: 'text-emerald-300',
  U: 'text-emerald-400',
  D: 'text-red-400 line-through',
  R: 'text-sky-300',
}
```

- [ ] **Step 5: Store**

```ts
// src/renderer/src/stores/filesStore.ts
import { create } from 'zustand'
import type { FsEntry, GitFileStatus } from '@shared/files'
import { dirsToReload } from '../files/tree'

type FilesState = {
  expanded: Record<string, true>
  children: Record<string, FsEntry[]>
  errors: Record<string, string>
  status: Record<string, Record<string, GitFileStatus>>
  indexes: Record<string, string[]>
  toggleDir(projectPath: string, dir: string): void
  loadDir(projectPath: string, dir: string): Promise<void>
  refreshStatus(projectPath: string): Promise<void>
  ensureIndex(projectPath: string): Promise<string[]>
  handleFsChanged(projectPath: string, paths: string[]): void
  handleGitChanged(projectPath: string): void
}

const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = rec
  return rest
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const inflightIndex = new Map<string, Promise<string[]>>()

export const useFiles = create<FilesState>()((set, get) => ({
  expanded: {},
  children: {},
  errors: {},
  status: {},
  indexes: {},
  toggleDir: (projectPath, dir) => {
    if (get().expanded[dir]) {
      set((s) => ({ expanded: without(s.expanded, dir) }))
      return
    }
    set((s) => ({ expanded: { ...s.expanded, [dir]: true } }))
    if (!get().children[dir]) void get().loadDir(projectPath, dir)
    if (dir === projectPath) void get().refreshStatus(projectPath)
  },
  loadDir: async (projectPath, dir) => {
    try {
      const entries = await window.api.invoke('fs:list', projectPath, dir)
      set((s) => ({ children: { ...s.children, [dir]: entries }, errors: without(s.errors, dir) }))
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, [dir]: `Não foi possível listar: ${message(err)}` } }))
    }
  },
  refreshStatus: async (projectPath) => {
    try {
      const status = await window.api.invoke('git:status', projectPath)
      set((s) => ({ status: { ...s.status, [projectPath]: status } }))
    } catch (err) {
      console.error('[next-ide] git status failed', projectPath, err)
    }
  },
  ensureIndex: (projectPath) => {
    const cached = get().indexes[projectPath]
    if (cached) return Promise.resolve(cached)
    let pending = inflightIndex.get(projectPath)
    if (!pending) {
      pending = window.api
        .invoke('fs:index', projectPath)
        .then((index) => {
          set((s) => ({ indexes: { ...s.indexes, [projectPath]: index } }))
          return index
        })
        .catch((err) => {
          console.error('[next-ide] file index failed', projectPath, err)
          return []
        })
        .finally(() => inflightIndex.delete(projectPath))
      inflightIndex.set(projectPath, pending)
    }
    return pending
  },
  handleFsChanged: (projectPath, paths) => {
    set((s) => ({ indexes: without(s.indexes, projectPath) }))
    for (const dir of dirsToReload(projectPath, Object.keys(get().children), paths)) void get().loadDir(projectPath, dir)
  },
  handleGitChanged: (projectPath) => {
    if (get().status[projectPath]) void get().refreshStatus(projectPath)
  },
}))

let subscribed = false
export function subscribeFileEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('fs:changed', (projectPath, paths) => useFiles.getState().handleFsChanged(projectPath, paths))
  window.api.on('git:changed', (projectPath) => useFiles.getState().handleGitChanged(projectPath))
}
```

Em `App.tsx`: `useEffect(() => subscribeFileEvents(), [])` ao lado de `subscribeAgentEvents`.

- [ ] **Step 6: `openFile` provisório** — em `dockStore.ts` acrescentar ao tipo `openFile(params: FilePanelParams): void` e a implementação `openFile: (params) => get().open(params)` (a Task 5 troca pelo foco em painel existente).

- [ ] **Step 7: Componentes**

```tsx
// src/renderer/src/sidebar/FileTree.tsx
import { useEffect } from 'react'
import type { FsEntry } from '@shared/files'
import { useDock } from '../dock/dockStore'
import { entryStatus, STATUS_CLASS } from '../files/tree'
import { useFiles } from '../stores/filesStore'

export function FileTree({ projectPath, dir, depth }: { projectPath: string; dir: string; depth: number }) {
  const entries = useFiles((s) => s.children[dir])
  const error = useFiles((s) => s.errors[dir])
  useEffect(() => {
    if (!entries && !error) void useFiles.getState().loadDir(projectPath, dir)
  }, [entries, error, projectPath, dir])
  const pad = { paddingLeft: `${depth * 12 + 8}px` }
  if (error) return <div style={pad} className="py-0.5 text-xs text-red-400">{error}</div>
  if (!entries) return <div style={pad} className="py-0.5 text-xs text-neutral-600">carregando…</div>
  if (entries.length === 0) return <div style={pad} className="py-0.5 text-xs text-neutral-600">vazio</div>
  return (
    <>
      {entries.map((entry) => (
        <FileTreeRow key={entry.path} projectPath={projectPath} entry={entry} depth={depth} />
      ))}
    </>
  )
}

function FileTreeRow({ projectPath, entry, depth }: { projectPath: string; entry: FsEntry; depth: number }) {
  const open = useFiles((s) => s.expanded[entry.path] === true)
  const status = useFiles((s) => entryStatus(s.status[projectPath], projectPath, entry))
  const onClick = () =>
    entry.kind === 'dir'
      ? useFiles.getState().toggleDir(projectPath, entry.path)
      : useDock.getState().openFile({ type: 'file', projectPath, filePath: entry.path })
  return (
    <>
      <button
        data-testid="tree-row"
        data-status={status ?? ''}
        title={entry.path}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`flex w-full items-center gap-1 rounded py-0.5 pr-1 text-left text-xs hover:bg-neutral-800/70 ${status ? STATUS_CLASS[status] : 'text-neutral-300'}`}
        onClick={onClick}
      >
        <span className="w-3 shrink-0 text-neutral-500">{entry.kind === 'dir' ? (open ? '▾' : '▸') : ''}</span>
        <span className="truncate">{entry.name}</span>
        {status && entry.kind === 'file' && <span className="ml-auto pl-1 text-[10px]">{status}</span>}
      </button>
      {entry.kind === 'dir' && open && <FileTree projectPath={projectPath} dir={entry.path} depth={depth + 1} />}
    </>
  )
}
```

```tsx
// src/renderer/src/sidebar/FileSearchResults.tsx
import { useEffect, useMemo } from 'react'
import { fuzzyFilter } from '@shared/fuzzy'
import { useDock } from '../dock/dockStore'
import { useFiles } from '../stores/filesStore'

export function FileSearchResults({ projectPath, query }: { projectPath: string; query: string }) {
  const index = useFiles((s) => s.indexes[projectPath])
  useEffect(() => {
    if (!index) void useFiles.getState().ensureIndex(projectPath)
  }, [index, projectPath])
  const hits = useMemo(() => fuzzyFilter(query.trim(), index ?? [], (s) => s, 50), [query, index])
  if (!index) return <div className="py-0.5 pl-8 text-xs text-neutral-600">indexando…</div>
  if (hits.length === 0) return <div className="py-0.5 pl-8 text-xs text-neutral-600">nenhum arquivo</div>
  return (
    <>
      {hits.map((rel) => (
        <button
          key={rel}
          data-testid="file-search-result"
          title={rel}
          className="block w-full truncate rounded py-0.5 pr-1 pl-8 text-left text-xs text-neutral-300 hover:bg-neutral-800/70"
          onClick={() => useDock.getState().openFile({ type: 'file', projectPath, filePath: `${projectPath}/${rel}` })}
        >
          {rel}
        </button>
      ))}
    </>
  )
}
```

- [ ] **Step 8: ProjectRow, Sidebar, useGitBranch**

Em `ProjectRow.tsx`, envolver o retorno num fragmento e acrescentar o chevron antes da bolinha de cor; trocar `pl-5` por `pl-1`:

```tsx
import { useFiles } from '../stores/filesStore'
import { useWorkspaces } from '../stores/workspaceStore'
import { FileSearchResults } from './FileSearchResults'
import { FileTree } from './FileTree'
// dentro do componente:
  const expanded = useFiles((s) => s.expanded[project.path] === true)
  const query = useWorkspaces((s) => s.query)
// dentro da linha, primeiro filho:
      <button
        aria-label={expanded ? `Recolher arquivos de ${project.name}` : `Expandir arquivos de ${project.name}`}
        className="w-4 shrink-0 text-xs text-neutral-500"
        onClick={() => useFiles.getState().toggleDir(project.path, project.path)}
      >
        {expanded ? '▾' : '▸'}
      </button>
// depois da linha:
      {expanded &&
        (query.trim() ? (
          <FileSearchResults projectPath={project.path} query={query} />
        ) : (
          <FileTree projectPath={project.path} dir={project.path} depth={1} />
        ))}
```

Em `Sidebar.tsx`: `const expanded = useFiles((s) => s.expanded)` e `const visible = filterWorkspaces(workspaces, query, (p) => expanded[p.path] === true)`.

`useGitBranch.ts` troca o `focus` pelo evento:

```ts
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
    const off = window.api.on('git:changed', (changed) => {
      if (changed === projectPath) refresh()
    })
    return () => {
      alive = false
      off()
    }
  }, [projectPath])
  return branch
}
```

- [ ] **Step 9: E2E** — primeiro acrescentar em `e2e/helpers.ts` (Playwright não importa bem entre specs; os specs das Tasks 5, 6 e 8 também usam):

```ts
// e2e/helpers.ts — imports extras: execFileSync de 'node:child_process', mkdirSync de 'node:fs'
export function fixtureProject(prefix = 'proj-files-'): { folder: string; name: string } {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(folder, 'src'))
  mkdirSync(join(folder, 'dist'))
  writeFileSync(join(folder, '.gitignore'), 'dist/\n')
  writeFileSync(join(folder, 'README.md'), '# fixture\n')
  writeFileSync(join(folder, 'dist', 'out.js'), 'x')
  writeFileSync(join(folder, 'src', 'app.ts'), Array.from({ length: 80 }, (_, i) => `export const v${i + 1} = ${i + 1}`).join('\n'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: folder })
  return { folder, name: basename(folder) }
}
```

```ts
// e2e/files-tree.spec.ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('árvore lista arquivos, respeita gitignore, mostra status e atualiza sozinha', async () => {
  const { folder, name } = fixtureProject()
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await expect(page.getByTestId('project-row').filter({ hasText: name })).toContainText('(main)')

  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  const rows = page.getByTestId('tree-row')
  await expect(rows.filter({ hasText: 'src' })).toBeVisible()
  await expect(rows.filter({ hasText: 'README.md' })).toHaveAttribute('data-status', 'U')
  await expect(rows.filter({ hasText: 'dist' })).toHaveCount(0)

  await rows.filter({ hasText: 'src' }).click()
  await expect(rows.filter({ hasText: 'app.ts' })).toBeVisible()
  writeFileSync(join(folder, 'src', 'novo.ts'), 'export {}')
  await expect(rows.filter({ hasText: 'novo.ts' })).toBeVisible({ timeout: 10_000 })

  await page.getByPlaceholder('Filtrar projetos').fill('app')
  await expect(page.getByTestId('file-search-result').filter({ hasText: 'src/app.ts' })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 10: Verificar** — `npx vitest run && npm run typecheck && npm run test:e2e -- files-tree sidebar` → verde.

- [ ] **Step 11: Commit** — `git add -A src test e2e && git commit -m "feat: add sidebar file tree with git status and live refresh"`

---

### Task 5: FilePanel (visualizador com shiki)

**Files:**
- Create: `src/renderer/src/files/languages.ts`, `src/renderer/src/files/highlighter.ts`, `src/renderer/src/panels/file/FilePanel.tsx`
- Modify: `src/renderer/src/dock/dockStore.ts` (`open` devolve id, `openFile` real, `lastAgent`/`noteActive`), `src/renderer/src/dock/Dock.tsx`, `src/renderer/src/styles.css`
- Test: `test/renderer/languages.test.ts`, `test/renderer/dockStore.test.ts`, `e2e/file-viewer.spec.ts`

**Interfaces:**
- Consumes: `fs:read`, `fs:changed` (Task 3); `FileContent` (Task 1); `replacementPatch` (Plano 1).
- Produces:
  - `SUPPORTED_LANGS`, `type SupportedLang`, `langForPath(path): SupportedLang | 'text'`
  - `highlight(code: string, lang: SupportedLang | 'text'): Promise<string>`
  - `useDock.open(params): string | null` (id do painel novo), `useDock.openFile(params: FilePanelParams): void`, `useDock.lastAgent: Record<string, string>` (projectPath → panelId do último agente ativo), `useDock.noteActive(panelId): void`
  - `FilePanel` com botão "Mencionar no agente" chamando `mentionInAgent` (criado na Task 6; nesta task o botão ainda não existe)

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/languages.test.ts
import { describe, expect, it } from 'vitest'
import { langForPath } from '@renderer/files/languages'

describe('langForPath', () => {
  it('maps extensions and special file names', () => {
    expect(langForPath('/p/src/a.ts')).toBe('typescript')
    expect(langForPath('/p/src/A.TSX')).toBe('tsx')
    expect(langForPath('/p/x.mjs')).toBe('javascript')
    expect(langForPath('/p/Dockerfile')).toBe('dockerfile')
    expect(langForPath('/p/Dockerfile.dev')).toBe('dockerfile')
    expect(langForPath('/p/Makefile')).toBe('make')
    expect(langForPath('/p/tsconfig.json')).toBe('jsonc')
    expect(langForPath('/p/.env')).toBe('ini')
    expect(langForPath('/p/script.zsh')).toBe('shellscript')
  })
  it('falls back to text', () => {
    expect(langForPath('/p/.gitignore')).toBe('text')
    expect(langForPath('/p/LICENSE')).toBe('text')
    expect(langForPath('/p/a.unknownext')).toBe('text')
  })
})
```

```ts
// test/renderer/dockStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDock } from '@renderer/dock/dockStore'

function fakeApi(panels: Array<{ id: string; params: Record<string, unknown> }>) {
  const addPanel = vi.fn()
  const live = panels.map((p) => ({ ...p, api: { updateParameters: vi.fn(), setActive: vi.fn() } }))
  useDock.setState({
    api: { panels: live, addPanel, activeGroup: undefined, getPanel: (id: string) => live.find((p) => p.id === id) } as never,
    lastAgent: {},
  })
  return { addPanel, live }
}

describe('dockStore', () => {
  beforeEach(() => useDock.setState({ api: null, lastAgent: {} }))

  it('open returns the new panel id', () => {
    const { addPanel } = fakeApi([])
    const id = useDock.getState().open({ type: 'terminal', projectPath: '/p' })
    expect(id).toMatch(/^terminal-/)
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({ id }))
  })

  it('openFile focuses an existing panel for the same file and replaces its line', () => {
    const { addPanel, live } = fakeApi([{ id: 'f1', params: { type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 3 } }])
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 9 })
    expect(addPanel).not.toHaveBeenCalled()
    expect(live[0]!.api.updateParameters).toHaveBeenCalledWith({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: 9 })
    expect(live[0]!.api.setActive).toHaveBeenCalled()
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/a.ts' })
    expect(live[0]!.api.updateParameters).toHaveBeenLastCalledWith({ type: 'file', projectPath: '/p', filePath: '/p/a.ts', line: undefined })
  })

  it('openFile opens a new panel for another file', () => {
    const { addPanel } = fakeApi([{ id: 'f1', params: { type: 'file', projectPath: '/p', filePath: '/p/a.ts' } }])
    useDock.getState().openFile({ type: 'file', projectPath: '/p', filePath: '/p/b.ts' })
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({ component: 'file', title: 'b.ts' }))
  })

  it('noteActive remembers the last active agent per project', () => {
    fakeApi([
      { id: 'a1', params: { type: 'agent', projectPath: '/p' } },
      { id: 't1', params: { type: 'terminal', projectPath: '/p' } },
    ])
    useDock.getState().noteActive('a1')
    useDock.getState().noteActive('t1')
    expect(useDock.getState().lastAgent).toEqual({ '/p': 'a1' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/languages.test.ts test/renderer/dockStore.test.ts` → FAIL.

- [ ] **Step 3: Linguagens**

```ts
// src/renderer/src/files/languages.ts
export const SUPPORTED_LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'json', 'jsonc', 'markdown', 'css', 'scss', 'html', 'vue', 'svelte',
  'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'ruby', 'php', 'lua',
  'yaml', 'toml', 'ini', 'xml', 'sql', 'graphql', 'prisma', 'shellscript', 'dockerfile', 'make', 'diff',
] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const BY_EXT: Record<string, SupportedLang> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonc: 'jsonc', md: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', html: 'html', htm: 'html', vue: 'vue', svelte: 'svelte',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php', lua: 'lua',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml', svg: 'xml', sql: 'sql',
  graphql: 'graphql', gql: 'graphql', prisma: 'prisma',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', diff: 'diff', patch: 'diff',
}
const BY_NAME: Record<string, SupportedLang> = {
  makefile: 'make', 'tsconfig.json': 'jsonc', '.env': 'ini', '.zshrc': 'shellscript', '.bashrc': 'shellscript',
}

export function langForPath(path: string): SupportedLang | 'text' {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const byName = BY_NAME[name]
  if (byName) return byName
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? (BY_EXT[name.slice(dot + 1)] ?? 'text') : 'text'
}
```

- [ ] **Step 4: Highlighter** (sem teste unitário: depende de módulos ESM do shiki e é coberto pelo E2E)

```ts
// src/renderer/src/files/highlighter.ts
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { SupportedLang } from './languages'

export const THEME = 'github-dark'
/** Above this, tokenizing blocks the UI for too long: render as plain text (still with line numbers). */
const PLAIN_ABOVE = 200_000

type LangInput = Parameters<HighlighterCore['loadLanguage']>[0]

// One dynamic import per language: Vite splits each grammar into its own chunk, loaded on first use.
const LOADERS: Record<SupportedLang, LangInput> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  markdown: () => import('@shikijs/langs/markdown'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  html: () => import('@shikijs/langs/html'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
  lua: () => import('@shikijs/langs/lua'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  xml: () => import('@shikijs/langs/xml'),
  sql: () => import('@shikijs/langs/sql'),
  graphql: () => import('@shikijs/langs/graphql'),
  prisma: () => import('@shikijs/langs/prisma'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  make: () => import('@shikijs/langs/make'),
  diff: () => import('@shikijs/langs/diff'),
}

let highlighter: Promise<HighlighterCore> | null = null
const getHighlighter = () =>
  (highlighter ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark')],
    langs: [],
    // JS regex engine: no WebAssembly, so the production CSP stays as is. `forgiving` skips the
    // rare grammar patterns it can't translate instead of throwing.
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  }))

export async function highlight(code: string, lang: SupportedLang | 'text'): Promise<string> {
  const hl = await getHighlighter()
  let target: SupportedLang | 'text' = code.length > PLAIN_ABOVE ? 'text' : lang
  if (target !== 'text' && !hl.getLoadedLanguages().includes(target)) {
    try {
      await hl.loadLanguage(LOADERS[target])
    } catch (err) {
      console.error('[next-ide] failed to load grammar', target, err)
      target = 'text'
    }
  }
  return hl.codeToHtml(code, { lang: target, theme: THEME })
}
```

- [ ] **Step 5: dockStore** — em `src/renderer/src/dock/dockStore.ts`:

```ts
import type { FilePanelParams, PanelParams } from '@shared/models'
import { replacementPatch } from './panelParams'

type DockState = {
  api: DockviewApi | null
  /** projectPath → id of the agent panel most recently active in that project. */
  lastAgent: Record<string, string>
  setApi(api: DockviewApi): void
  open(params: PanelParams): string | null
  openFile(params: FilePanelParams): void
  noteActive(panelId: string): void
  split(direction: 'right' | 'below'): void
  requestClose(panelId: string): void
  closeActive(): void
  focus(panelId: string): void
  focusGroup(index: number): void
}
// na implementação:
  lastAgent: {},
  open: (params) => {
    const api = get().api
    if (!api) return null
    const id = newPanelId(params.type)
    api.addPanel(buildAddPanelOptions(params, id, { kind: 'activeGroup', groupId: api.activeGroup?.id }))
    return id
  },
  openFile: (params) => {
    const api = get().api
    if (!api) return
    const existing = api.panels.find((p) => {
      const q = p.params as PanelParams | undefined
      return q?.type === 'file' && q.filePath === params.filePath
    })
    if (!existing) {
      get().open(params)
      return
    }
    existing.api.updateParameters(replacementPatch(existing.params, params))
    existing.api.setActive()
  },
  noteActive: (panelId) => {
    const params = get().api?.getPanel(panelId)?.params as PanelParams | undefined
    if (params?.type === 'agent') set((s) => ({ lastAgent: { ...s.lastAgent, [params.projectPath]: panelId } }))
  },
```

Em `Dock.tsx`, dentro de `onReady`: `api.onDidActivePanelChange((panel) => { if (panel) useDock.getState().noteActive(panel.id) })`, e `components` ganha `file: FilePanel`. No `registerPanelRemovedListener` de agente, apagar também a entrada de `lastAgent` que aponta para o painel removido:

```ts
  useDock.setState((s) => ({ lastAgent: Object.fromEntries(Object.entries(s.lastAgent).filter(([, id]) => id !== panelId)) }))
```

- [ ] **Step 6: FilePanel**

```tsx
// src/renderer/src/panels/file/FilePanel.tsx
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '@shared/files'
import type { FilePanelParams } from '@shared/models'
import { highlight } from '../../files/highlighter'
import { langForPath } from '../../files/languages'
import { relPath } from '../../files/tree'

const NOTICE: Partial<Record<FileContent['kind'], string>> = {
  binary: 'Arquivo binário — não exibido.',
  'too-large': 'Arquivo maior que 2 MB — não exibido.',
  missing: 'Arquivo não encontrado (removido ou renomeado).',
  forbidden: 'Arquivo fora das pastas dos workspaces — não exibido.',
}

export function FilePanel({ params }: IDockviewPanelProps<FilePanelParams>) {
  const [content, setContent] = useState<FileContent | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    window.api
      .invoke('fs:read', params.filePath)
      .then(async (c) => {
        if (!alive) return
        setContent(c)
        setError(null)
        const h = c.kind === 'text' ? await highlight(c.text, langForPath(params.filePath)) : null
        if (alive) setHtml(h)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [params.filePath, version])

  useEffect(
    () =>
      window.api.on('fs:changed', (projectPath, paths) => {
        if (projectPath === params.projectPath && (paths.includes(params.filePath) || paths.includes(projectPath))) {
          setVersion((v) => v + 1)
        }
      }),
    [params.projectPath, params.filePath],
  )

  useEffect(() => {
    const root = codeRef.current
    if (!root || !html) return
    root.querySelectorAll('.line-target').forEach((el) => el.classList.remove('line-target'))
    if (!params.line) return
    const line = root.querySelectorAll('.line')[params.line - 1]
    line?.classList.add('line-target')
    line?.scrollIntoView({ block: 'center' })
  }, [html, params.line])

  return (
    <div className="flex h-full flex-col bg-neutral-950" data-testid="file-panel">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1 text-xs text-neutral-400">
        <span className="min-w-0 flex-1 truncate" title={params.filePath}>
          {relPath(params.projectPath, params.filePath)}
        </span>
        {/* Task 6 adds the "Mencionar no agente" button here */}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <div className="p-3 text-sm text-red-400">Falha ao abrir: {error}</div>}
        {!error && content && NOTICE[content.kind] && (
          <div data-testid="file-notice" className="p-3 text-sm text-neutral-400">
            {NOTICE[content.kind]}
          </div>
        )}
        {!error && content?.kind === 'image' && (
          <div className="flex h-full items-center justify-center p-4">
            <img alt={params.filePath} src={content.dataUrl} className="max-h-full max-w-full object-contain" />
          </div>
        )}
        {!error && content?.kind === 'text' && html && (
          // shiki escapes the source text; the markup is its own <pre><code><span class="line">.
          <div ref={codeRef} data-testid="file-code" className="file-code text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
```

Em `src/renderer/src/styles.css` acrescentar:

```css
.file-code pre.shiki {
  margin: 0;
  padding: 0.5rem 0;
  background: transparent !important;
  counter-reset: line;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.file-code .line::before {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 3rem;
  margin-right: 1rem;
  text-align: right;
  color: #525252;
  user-select: none;
}
.file-code .line-target {
  background: rgb(234 88 12 / 0.18);
}
```

- [ ] **Step 7: E2E**

```ts
// e2e/file-viewer.spec.ts
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('abre arquivo com destaque, numeração e recarrega quando muda em disco', async () => {
  const { folder, name } = fixtureProject('proj-viewer-')
  const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  writeFileSync(join(folder, 'logo.png'), Buffer.from(onePixelPng, 'base64'))
  writeFileSync(join(folder, 'blob.bin'), Buffer.from([0, 1, 2, 3]))
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  const rows = page.getByTestId('tree-row')
  await rows.filter({ hasText: 'src' }).click()
  await rows.filter({ hasText: 'app.ts' }).click()

  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toBeVisible()
  const code = page.getByTestId('file-code')
  await expect(code).toContainText('export const v80 = 80')
  await expect(code.locator('.line')).toHaveCount(80)
  await expect(code.locator('span[style*="color"]').first()).toBeVisible()

  writeFileSync(join(folder, 'src', 'app.ts'), 'export const mudou = true\n')
  await expect(code).toContainText('mudou', { timeout: 10_000 })

  await rows.filter({ hasText: 'app.ts' }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toHaveCount(1)

  await rows.filter({ hasText: 'logo.png' }).click()
  await expect(page.getByTestId('file-panel').locator('img')).toBeVisible()
  await rows.filter({ hasText: 'blob.bin' }).click()
  await expect(page.getByTestId('file-notice').filter({ hasText: 'binário' })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 8: Verificar** — `npx vitest run && npm run typecheck && npm run build && npm run test:e2e -- file-viewer files-tree` → verde. Conferir que `out/renderer` tem chunks separados de linguagem (`ls out/renderer/assets | grep -c typescript` ≥ 1).

- [ ] **Step 9: Commit** — `git add -A src test e2e && git commit -m "feat: add read-only file viewer with shiki highlighting"`

---

### Task 6: Menções `@` (composer e "Mencionar no agente")

**Files:**
- Create: `src/renderer/src/agent/mentions.ts`, `src/renderer/src/dock/mention.ts`, `src/renderer/src/panels/agent/MentionMenu.tsx`
- Modify: `src/renderer/src/stores/agentStore.ts`, `src/renderer/src/panels/agent/Composer.tsx`, `src/renderer/src/panels/file/FilePanel.tsx`
- Test: `test/renderer/mentions.test.ts`, `test/renderer/agentStore.test.ts`, `e2e/mentions.spec.ts`

**Interfaces:**
- Consumes: `useDock.open` (devolve id), `useDock.lastAgent`, `useDock.focus` (Task 5); `useFiles.ensureIndex`, `useFiles.indexes` (Task 4); `fuzzyFilter` (Task 2).
- Produces:
  - `type LineRange = { start: number; end: number }`, `formatMention(projectPath, filePath, range?)`, `mentionQuery(text, caret): { query: string; start: number } | null`, `applyMention(text, start, caret, rel): { text: string; caret: number }`, `appendSnippet(draft, snippet): string`, `type AgentCandidate = { id: string; projectPath: string; visible: boolean }`, `pickAgentPanel(candidates, projectPath, preferredId?): string | null`
  - `useAgents` ganha `drafts: Record<string, string>`, `setDraft(panelId, text)`, `insertIntoDraft(panelId, snippet)`; `remove` apaga o rascunho
  - `mentionInAgent(projectPath: string, filePath: string, range: LineRange | null): void`
  - `<textarea data-composer={panelId}>` no Composer

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/mentions.test.ts
import { describe, expect, it } from 'vitest'
import { appendSnippet, applyMention, formatMention, mentionQuery, pickAgentPanel } from '@renderer/agent/mentions'

describe('formatMention', () => {
  it('uses project-relative paths and optional line ranges', () => {
    expect(formatMention('/p', '/p/src/a.ts')).toBe('@src/a.ts')
    expect(formatMention('/p', '/p/src/a.ts', { start: 10, end: 10 })).toBe('@src/a.ts#L10')
    expect(formatMention('/p', '/p/src/a.ts', { start: 20, end: 10 })).toBe('@src/a.ts#L10-20')
    expect(formatMention('/p', '/other/x.ts')).toBe('@/other/x.ts')
  })
})

describe('mentionQuery', () => {
  it('finds an @ token that ends at the caret', () => {
    expect(mentionQuery('veja @src/ap', 12)).toEqual({ query: 'src/ap', start: 5 })
    expect(mentionQuery('@', 1)).toEqual({ query: '', start: 0 })
    expect(mentionQuery('linha 1\n@x', 10)).toEqual({ query: 'x', start: 8 })
  })
  it('ignores e-mails, finished tokens and carets elsewhere', () => {
    expect(mentionQuery('mail a@b.com', 12)).toBeNull()
    expect(mentionQuery('@src/a.ts ', 10)).toBeNull()
    expect(mentionQuery('@src e mais', 11)).toBeNull()
  })
})

describe('applyMention', () => {
  it('replaces the whole token (even past the caret) and places the caret after it', () => {
    expect(applyMention('veja @ap agora', 5, 8, 'src/app.ts')).toEqual({ text: 'veja @src/app.ts agora', caret: 17 })
    expect(applyMention('@a', 0, 2, 'a.ts')).toEqual({ text: '@a.ts ', caret: 6 })
    expect(applyMention('@apxyz fim', 0, 3, 'app.ts')).toEqual({ text: '@app.ts fim', caret: 8 })
  })
})

describe('appendSnippet', () => {
  it('keeps one space between existing text and the snippet', () => {
    expect(appendSnippet('', '@a.ts')).toBe('@a.ts ')
    expect(appendSnippet('olha', '@a.ts')).toBe('olha @a.ts ')
    expect(appendSnippet('olha ', '@a.ts')).toBe('olha @a.ts ')
  })
})

describe('pickAgentPanel', () => {
  const c = [
    { id: 'a1', projectPath: '/p', visible: false },
    { id: 'a2', projectPath: '/p', visible: true },
    { id: 'b1', projectPath: '/q', visible: true },
  ]
  it('prefers the remembered agent, then a visible one, then any, of the same project', () => {
    expect(pickAgentPanel(c, '/p', 'a1')).toBe('a1')
    expect(pickAgentPanel(c, '/p', 'b1')).toBe('a2')
    expect(pickAgentPanel(c, '/p')).toBe('a2')
    expect(pickAgentPanel([c[0]!], '/p')).toBe('a1')
    expect(pickAgentPanel(c, '/z')).toBeNull()
  })
})
```

```ts
// acrescentar em test/renderer/agentStore.test.ts (beforeEach passa a resetar drafts: {})
it('keeps a draft per panel, appends snippets, and drops it on remove', () => {
  useAgents.getState().setDraft('p1', 'olha')
  useAgents.getState().insertIntoDraft('p1', '@a.ts')
  expect(useAgents.getState().drafts.p1).toBe('olha @a.ts ')
  useAgents.getState().insertIntoDraft('p2', '@b.ts')
  expect(useAgents.getState().drafts.p2).toBe('@b.ts ')
  useAgents.getState().remove('p1')
  expect(useAgents.getState().drafts.p1).toBeUndefined()
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/mentions.test.ts test/renderer/agentStore.test.ts` → FAIL.

- [ ] **Step 3: Funções puras**

```ts
// src/renderer/src/agent/mentions.ts
export type LineRange = { start: number; end: number }
export type AgentCandidate = { id: string; projectPath: string; visible: boolean }

export function formatMention(projectPath: string, filePath: string, range?: LineRange | null): string {
  const rel = filePath.startsWith(`${projectPath}/`) ? filePath.slice(projectPath.length + 1) : filePath
  if (!range) return `@${rel}`
  const a = Math.min(range.start, range.end)
  const b = Math.max(range.start, range.end)
  return `@${rel}#L${a}${b > a ? `-${b}` : ''}`
}

/** The `@token` that ends at the caret (token = run of non-whitespace starting with @). */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  let i = caret
  while (i > 0 && !/\s/.test(text[i - 1]!)) i--
  if (text[i] !== '@' || i === caret) return null
  return { query: text.slice(i + 1, caret), start: i }
}

export function applyMention(text: string, start: number, caret: number, rel: string): { text: string; caret: number } {
  const insert = `@${rel} `
  const rest = text.slice(caret).replace(/^\S*/, '').replace(/^ /, '')
  return { text: text.slice(0, start) + insert + rest, caret: start + insert.length }
}

export function appendSnippet(draft: string, snippet: string): string {
  if (!draft) return `${snippet} `
  return /\s$/.test(draft) ? `${draft}${snippet} ` : `${draft} ${snippet} `
}

export function pickAgentPanel(candidates: AgentCandidate[], projectPath: string, preferredId?: string): string | null {
  const same = candidates.filter((c) => c.projectPath === projectPath)
  return (same.find((c) => c.id === preferredId) ?? same.find((c) => c.visible) ?? same[0])?.id ?? null
}
```

- [ ] **Step 4: Rascunho no agentStore** — em `src/renderer/src/stores/agentStore.ts`:

```ts
import { appendSnippet } from '../agent/mentions'
// AgentsState:
  /** Composer text per panel; lives here so other panels (file viewer) can insert @mentions. */
  drafts: Record<string, string>
  setDraft(panelId: string, text: string): void
  insertIntoDraft(panelId: string, snippet: string): void
// implementação:
  drafts: {},
  setDraft: (panelId, text) => set((s) => ({ drafts: { ...s.drafts, [panelId]: text } })),
  insertIntoDraft: (panelId, snippet) =>
    set((s) => ({ drafts: { ...s.drafts, [panelId]: appendSnippet(s.drafts[panelId] ?? '', snippet) } })),
// remove: além de chats, remover drafts[panelId]:
  remove: (panelId) =>
    set((s) => {
      pendingSessionId.delete(panelId)
      const { [panelId]: _removed, ...rest } = s.chats
      const { [panelId]: _draft, ...drafts } = s.drafts
      return { chats: rest, drafts }
    }),
```

- [ ] **Step 5: `mentionInAgent`**

```ts
// src/renderer/src/dock/mention.ts
import type { PanelParams } from '@shared/models'
import { formatMention, pickAgentPanel, type AgentCandidate, type LineRange } from '../agent/mentions'
import { useAgents } from '../stores/agentStore'
import { useDock } from './dockStore'

export function mentionInAgent(projectPath: string, filePath: string, range: LineRange | null): void {
  const dock = useDock.getState()
  if (!dock.api) return
  const candidates: AgentCandidate[] = dock.api.panels.flatMap((p) => {
    const params = p.params as PanelParams | undefined
    return params?.type === 'agent' ? [{ id: p.id, projectPath: params.projectPath, visible: p.api.isVisible }] : []
  })
  const id = pickAgentPanel(candidates, projectPath, dock.lastAgent[projectPath]) ?? dock.open({ type: 'agent', projectPath })
  if (!id) return
  useAgents.getState().insertIntoDraft(id, formatMention(projectPath, filePath, range))
  dock.focus(id)
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-composer="${CSS.escape(id)}"]`)
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
}
```

- [ ] **Step 6: Botão no FilePanel** — em `FilePanel.tsx`, trocar o comentário da barra por:

```tsx
        <button
          className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700"
          onMouseDown={(e) => e.preventDefault() /* keep the code selection */}
          onClick={() => mentionInAgent(params.projectPath, params.filePath, selectedLineRange(codeRef.current))}
        >
          Mencionar no agente
        </button>
```

e, no mesmo arquivo:

```tsx
import type { LineRange } from '../../agent/mentions'
import { mentionInAgent } from '../../dock/mention'

/** 1-based line numbers covered by the current text selection inside the code view, if any. */
function selectedLineRange(root: HTMLElement | null): LineRange | null {
  const sel = window.getSelection()
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const lines = Array.from(root.querySelectorAll('.line'))
  const lineOf = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement
    const line = el?.closest('.line')
    return line && root.contains(line) ? lines.indexOf(line) + 1 : 0
  }
  const a = lineOf(sel.anchorNode)
  const b = lineOf(sel.focusNode)
  return a && b ? { start: Math.min(a, b), end: Math.max(a, b) } : null
}
```

- [ ] **Step 7: MentionMenu**

```tsx
// src/renderer/src/panels/agent/MentionMenu.tsx
export function MentionMenu({ items, activeIndex, onPick }: { items: string[]; activeIndex: number; onPick(rel: string): void }) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label="Arquivos" className="mb-1 max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 py-1 text-xs">
      {items.map((rel, i) => (
        <li
          key={rel}
          role="option"
          aria-selected={i === activeIndex}
          className={`cursor-pointer truncate px-3 py-1 text-neutral-200 ${i === activeIndex ? 'bg-neutral-800' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(rel)
          }}
        >
          @{rel}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 8: Composer** — em `Composer.tsx`:

```tsx
import { fuzzyFilter } from '@shared/fuzzy'
import { applyMention, mentionQuery } from '../../agent/mentions'
import { useAgents } from '../../stores/agentStore'
import { useFiles } from '../../stores/filesStore'
import { MentionMenu } from './MentionMenu'

// trocar `const [text, setText] = useState('')` por:
  const text = useAgents((s) => s.drafts[panelId] ?? '')
  const setText = (value: string) => useAgents.getState().setDraft(panelId, value)
  const [caret, setCaret] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
// depois de menuItems:
  const mention = query === null ? mentionQuery(text, caret) : null
  const index = useFiles((s) => s.indexes[projectPath])
  const mentionItems = mention && mention.start !== dismissedAt ? fuzzyFilter(mention.query, index ?? [], (s) => s, 8) : []
  const activeIndex = (n: number) => Math.min(menuIndex, Math.max(n - 1, 0))

  useEffect(() => {
    if (mention && !index) void useFiles.getState().ensureIndex(projectPath)
  }, [mention !== null, index, projectPath])

  const pickMention = (rel: string) => {
    if (!mention) return
    const next = applyMention(text, mention.start, caret, rel)
    setText(next.text)
    setCaret(next.caret)
    setMenuIndex(0)
    requestAnimationFrame(() => textarea.current?.setSelectionRange(next.caret, next.caret))
  }
```

No JSX, logo depois de `<SlashMenu …/>`:

```tsx
      <MentionMenu items={mentionItems} activeIndex={activeIndex(mentionItems.length)} onPick={pickMention} />
```

No `<textarea>`: acrescentar `data-composer={panelId}`, trocar `onChange` e acrescentar `onSelect`:

```tsx
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setDismissedAt(null)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
```

No começo de `onKeyDown`, antes do bloco do menu de comandos:

```tsx
          if (mentionItems.length > 0 && mention) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setMenuIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : mentionItems.length - 1)) % mentionItems.length)
              return
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
              e.preventDefault()
              pickMention(mentionItems[activeIndex(mentionItems.length)]!)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDismissedAt(mention.start)
              return
            }
          }
```

`submit()` continua chamando `setText('')` (agora limpa o rascunho do store). O `useLayoutEffect` de altura continua dependendo de `[text]`.

- [ ] **Step 9: E2E**

```ts
// e2e/mentions.spec.ts
import { expect, test } from '@playwright/test'
import { fixtureProject, launch } from './helpers'

test('menciona arquivo no agente pelo visualizador e pelo @ do composer', async () => {
  const { folder, name } = fixtureProject('proj-mention-')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()

  // Sem agente aberto: o botão abre um novo e já insere a menção.
  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  await page.getByTestId('tree-row').filter({ hasText: 'README.md' }).click()
  await page.getByRole('button', { name: 'Mencionar no agente' }).click()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await expect(input).toHaveValue('@README.md ')

  await input.fill('')
  await input.pressSequentially('veja @app')
  await expect(page.getByRole('listbox', { name: 'Arquivos' }).getByRole('option').first()).toHaveText('@src/app.ts')
  await input.press('Enter')
  await expect(input).toHaveValue('veja @src/app.ts ')
  await app.close()
})
```

- [ ] **Step 10: Verificar** — `npx vitest run && npm run typecheck && npm run test:e2e -- mentions agent-slash agent-images agent` → verde (os specs do agente garantem que o composer continua funcionando com o rascunho no store).

- [ ] **Step 11: Commit** — `git add -A src test e2e && git commit -m "feat: add @file mentions in the composer and from the file viewer"`

---

### Task 7: Caminhos clicáveis nos cartões de ferramentas

**Files:**
- Create: `src/renderer/src/agent/toolLinks.ts`, `src/renderer/src/panels/agent/agentPanelContext.ts`, `src/renderer/src/panels/agent/cards/FilePathLink.tsx`
- Modify: `src/renderer/src/panels/agent/AgentPanel.tsx`, `src/renderer/src/panels/agent/cards/DiffCard.tsx`, `src/renderer/src/panels/agent/cards/GenericToolCard.tsx`
- Test: `test/renderer/toolLinks.test.ts`, `e2e/agent-tools.spec.ts`

**Interfaces:**
- Consumes: `useDock.openFile` (Task 5); `useWorkspaces` (Plano 1); `projectPaths` (Task 3).
- Produces:
  - `type FileTarget = { path: string; line?: number }`, `resolveToolPath(projectPath, p): string`, `toolFileTarget(name, input): FileTarget | null`, `parseToolOutputLine(line): FileTarget | null`, `projectForPath(roots, path): string | null`
  - `AgentPanelContext` (`{ projectPath: string }`), `<FilePathLink path line? className? />`

- [ ] **Step 1: Testes falhando**

```ts
// test/renderer/toolLinks.test.ts
import { describe, expect, it } from 'vitest'
import { parseToolOutputLine, projectForPath, resolveToolPath, toolFileTarget } from '@renderer/agent/toolLinks'

describe('toolLinks', () => {
  it('resolveToolPath makes relative paths absolute and normalizes dots', () => {
    expect(resolveToolPath('/p', 'src/a.ts')).toBe('/p/src/a.ts')
    expect(resolveToolPath('/p', './src/../b.ts')).toBe('/p/b.ts')
    expect(resolveToolPath('/p', '/abs/x.ts')).toBe('/abs/x.ts')
  })

  it('toolFileTarget reads file_path / notebook_path and Read offsets', () => {
    expect(toolFileTarget('Edit', { file_path: '/p/a.ts' })).toEqual({ path: '/p/a.ts' })
    expect(toolFileTarget('Read', { file_path: '/p/a.ts', offset: 120, limit: 40 })).toEqual({ path: '/p/a.ts', line: 120 })
    expect(toolFileTarget('NotebookEdit', { notebook_path: '/p/n.ipynb' })).toEqual({ path: '/p/n.ipynb' })
    expect(toolFileTarget('Grep', { pattern: 'x', path: 'src' })).toBeNull()
    expect(toolFileTarget('Bash', { command: 'ls' })).toBeNull()
  })

  it('parseToolOutputLine understands grep content lines and bare file lists', () => {
    expect(parseToolOutputLine('src/a.ts:12:const x = 1')).toEqual({ path: 'src/a.ts', line: 12 })
    expect(parseToolOutputLine('/p/src/a.ts-3-context')).toBeNull()
    expect(parseToolOutputLine('/p/src/a.ts')).toEqual({ path: '/p/src/a.ts' })
    expect(parseToolOutputLine('src/components/Button.tsx')).toEqual({ path: 'src/components/Button.tsx' })
    expect(parseToolOutputLine('Found 3 files')).toBeNull()
    expect(parseToolOutputLine('')).toBeNull()
  })

  it('projectForPath picks the deepest workspace folder containing the path', () => {
    expect(projectForPath(['/x', '/x/api'], '/x/api/src/a.ts')).toBe('/x/api')
    expect(projectForPath(['/x'], '/y/a.ts')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/toolLinks.test.ts` → FAIL.

- [ ] **Step 3: Implementar helpers**

```ts
// src/renderer/src/agent/toolLinks.ts
import { isUnder } from '../files/tree'

export type FileTarget = { path: string; line?: number }
type Rec = Record<string, unknown>

function normalize(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `/${out.join('/')}`
}

export const resolveToolPath = (projectPath: string, p: string): string => normalize(p.startsWith('/') ? p : `${projectPath}/${p}`)

export function toolFileTarget(name: string, input: unknown): FileTarget | null {
  if (typeof input !== 'object' || input === null) return null
  const rec = input as Rec
  const path = typeof rec.file_path === 'string' ? rec.file_path : typeof rec.notebook_path === 'string' ? rec.notebook_path : null
  if (!path) return null
  if (name === 'Read' && typeof rec.offset === 'number' && rec.offset > 0) return { path, line: rec.offset }
  return { path }
}

/** One line of Grep/Glob output: `path:line:text` (grep -n) or a bare path (file lists). */
export function parseToolOutputLine(line: string): FileTarget | null {
  const withLine = /^([^\s:][^:]*?):(\d+):/.exec(line)
  if (withLine) return { path: withLine[1]!, line: Number(withLine[2]) }
  if (!line || /\s/.test(line) || line.includes(':')) return null
  if (/-\d+-/.test(line)) return null // grep context line (`path-12-text`), not a file name
  return /[/.]/.test(line) ? { path: line } : null
}

export function projectForPath(roots: string[], path: string): string | null {
  return roots.filter((r) => isUnder(path, r)).sort((a, b) => b.length - a.length)[0] ?? null
}
```

- [ ] **Step 4: Contexto e link**

```ts
// src/renderer/src/panels/agent/agentPanelContext.ts
import { createContext } from 'react'

/** Lets deeply nested (memoized) chat cards resolve relative tool paths against the panel's project. */
export const AgentPanelContext = createContext<{ projectPath: string }>({ projectPath: '' })
```

```tsx
// src/renderer/src/panels/agent/cards/FilePathLink.tsx
import { useContext } from 'react'
import { projectPaths } from '@shared/workspaces'
import { projectForPath, resolveToolPath } from '../../../agent/toolLinks'
import { useDock } from '../../../dock/dockStore'
import { useWorkspaces } from '../../../stores/workspaceStore'
import { AgentPanelContext } from '../agentPanelContext'

export function FilePathLink({ path, line, className = '' }: { path: string; line?: number | undefined; className?: string }) {
  const { projectPath } = useContext(AgentPanelContext)
  const abs = resolveToolPath(projectPath, path)
  return (
    <button
      type="button"
      data-testid="file-link"
      title={abs}
      className={`truncate text-left underline-offset-2 hover:text-neutral-100 hover:underline ${className}`}
      onClick={(e) => {
        // Links live inside <summary>: don't also toggle the card.
        e.preventDefault()
        e.stopPropagation()
        const owner = projectForPath(projectPaths(useWorkspaces.getState().workspaces), abs) ?? projectPath
        useDock.getState().openFile({ type: 'file', projectPath: owner, filePath: abs, ...(line ? { line } : {}) })
      }}
    >
      {path}
      {line ? `:${line}` : ''}
    </button>
  )
}
```

Um caminho fora dos workspaces abre o painel mesmo assim, e o FilePanel mostra o aviso `forbidden` ("fora das pastas dos workspaces").

- [ ] **Step 5: Usar nos cartões**

`AgentPanel.tsx`: `const panelCtx = useMemo(() => ({ projectPath: params.projectPath }), [params.projectPath])` e envolver o `ChatActionsContext.Provider` com `<AgentPanelContext.Provider value={panelCtx}>…</AgentPanelContext.Provider>`.

`DiffCard.tsx`: trocar `<span className="truncate text-neutral-400">{filePath}</span>` por `<FilePathLink path={filePath} className="text-neutral-400" />`.

`GenericToolCard.tsx`:

```tsx
import { parseToolOutputLine, toolFileTarget } from '../../../agent/toolLinks'
import { FilePathLink } from './FilePathLink'

const LINKED_OUTPUT = new Set(['Grep', 'Glob'])

function OutputLines({ output }: { output: string }) {
  return (
    <>
      {output.split('\n').map((line, i) => {
        const target = parseToolOutputLine(line)
        if (!target) return <div key={i}>{line}</div>
        const rest = target.line ? line.slice(line.indexOf(`:${target.line}:`) + `:${target.line}:`.length) : ''
        return (
          <div key={i} className="flex gap-1">
            <FilePathLink path={target.path} line={target.line} className="shrink-0 text-sky-300" />
            {rest && <span className="truncate">{rest}</span>}
          </div>
        )
      })}
    </>
  )
}

export function GenericToolCard({ item }: { item: ToolItem }) {
  const target = toolFileTarget(item.name, item.input)
  return (
    <details className="rounded border border-neutral-800 text-xs" data-testid="tool-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-neutral-300">
        <span className="font-medium">{item.name}</span>
        {target ? (
          <FilePathLink path={target.path} line={target.line} className="text-neutral-500" />
        ) : (
          <span className="truncate text-neutral-500">{toolSummary(item.input)}</span>
        )}
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && (
        <pre className="max-h-64 overflow-auto border-t border-neutral-800 p-2 whitespace-pre-wrap text-neutral-400">
          {LINKED_OUTPUT.has(item.name) && !item.isError ? <OutputLines output={item.output} /> : item.output}
        </pre>
      )}
    </details>
  )
}
```

- [ ] **Step 6: E2E** — em `e2e/agent-tools.spec.ts`, depois das asserções do diff:

```ts
  await diff.getByTestId('file-link').click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'exemplo.ts' })).toBeVisible()
  await expect(page.getByTestId('file-notice')).toContainText('fora das pastas')
  await expect(diff).toHaveAttribute('open', '')
```

(`/tmp/exemplo.ts` do agente falso fica fora do workspace do teste, então o painel abre com o aviso — isso também prova que o main recusa o caminho.)

- [ ] **Step 7: Verificar** — `npx vitest run && npm run typecheck && npm run test:e2e -- agent-tools` → verde.

- [ ] **Step 8: Commit** — `git add -A src test e2e && git commit -m "feat: open files from paths in agent tool cards"`

---

### Task 8: Busca rápida `Cmd+P`

**Files:**
- Create: `src/renderer/src/quickopen/quickOpenStore.ts`, `src/renderer/src/quickopen/QuickOpen.tsx`
- Modify: `src/renderer/src/dock/shortcuts.ts`, `src/renderer/src/dock/useDockShortcuts.ts`, `src/renderer/src/App.tsx`
- Test: `test/renderer/shortcuts.test.ts`, `e2e/quickopen.spec.ts`

**Interfaces:**
- Consumes: `useFiles.ensureIndex`/`indexes` (Task 4), `uniqueProjects` (Task 3), `fuzzyFilter` (Task 2), `useDock.openFile` (Task 5).
- Produces: `DockCommand` ganha `{ kind: 'quickOpen' }`; `useQuickOpen` (`open`, `show()`, `hide()`); `<QuickOpen />` montado no `App`.

- [ ] **Step 1: Teste falhando** — em `test/renderer/shortcuts.test.ts`:

```ts
  it('Cmd+P opens quick open, Cmd+Shift+P does not', () => {
    expect(matchShortcut(ev({ key: 'p', code: 'KeyP' }))).toEqual({ kind: 'quickOpen' })
    expect(matchShortcut(ev({ key: 'P', code: 'KeyP', shiftKey: true }))).toBeNull()
  })
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/renderer/shortcuts.test.ts` → FAIL.

- [ ] **Step 3: Atalho** — `shortcuts.ts`: acrescentar `| { kind: 'quickOpen' }` ao tipo e, depois de `if (e.key.toLowerCase() === 'w') …`, `if (e.key.toLowerCase() === 'p') return { kind: 'quickOpen' }`. `useDockShortcuts.ts`: trocar o `else` final por

```ts
      else if (cmd.kind === 'quickOpen') useQuickOpen.getState().show()
      else dock.focusGroup(cmd.index)
```

- [ ] **Step 4: Store e modal**

```ts
// src/renderer/src/quickopen/quickOpenStore.ts
import { create } from 'zustand'

export const useQuickOpen = create<{ open: boolean; show(): void; hide(): void }>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
```

```tsx
// src/renderer/src/quickopen/QuickOpen.tsx
import { useEffect, useMemo, useState } from 'react'
import { fuzzyFilter } from '@shared/fuzzy'
import { uniqueProjects } from '@shared/workspaces'
import { useDock } from '../dock/dockStore'
import { useFiles } from '../stores/filesStore'
import { useWorkspaces } from '../stores/workspaceStore'
import { useQuickOpen } from './quickOpenStore'

type Hit = { projectPath: string; projectName: string; rel: string }

export function QuickOpen() {
  const open = useQuickOpen((s) => s.open)
  return open ? <QuickOpenDialog /> : null
}

function QuickOpenDialog() {
  const workspaces = useWorkspaces((s) => s.workspaces)
  const indexes = useFiles((s) => s.indexes)
  const projects = useMemo(() => uniqueProjects(workspaces), [workspaces])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    for (const p of projects) void useFiles.getState().ensureIndex(p.path)
  }, [projects])

  const all = useMemo<Hit[]>(
    () => projects.flatMap((p) => (indexes[p.path] ?? []).map((rel) => ({ projectPath: p.path, projectName: p.name, rel }))),
    [projects, indexes],
  )
  const hits = useMemo(() => fuzzyFilter(query.trim(), all, (h) => `${h.projectName}/${h.rel}`, 50), [query, all])
  const current = Math.min(active, Math.max(hits.length - 1, 0))
  const hide = () => useQuickOpen.getState().hide()
  const choose = (hit: Hit | undefined) => {
    if (!hit) return
    hide()
    useDock.getState().openFile({ type: 'file', projectPath: hit.projectPath, filePath: `${hit.projectPath}/${hit.rel}` })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-24" onMouseDown={hide}>
      <div
        role="dialog"
        aria-label="Busca rápida"
        className="h-fit w-[560px] max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Buscar arquivo"
          placeholder="Buscar arquivo em todos os projetos…"
          className="w-full rounded-t-lg bg-transparent px-3 py-2 text-sm text-neutral-100 outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') hide()
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (hits.length) setActive((current + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(hits[current])
            }
          }}
        />
        <ul role="listbox" aria-label="Arquivos encontrados" className="max-h-80 overflow-auto border-t border-neutral-800 py-1 text-xs">
          {hits.length === 0 && <li className="px-3 py-1 text-neutral-500">{all.length ? 'nenhum arquivo' : 'indexando…'}</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.projectPath}/${h.rel}`}
              role="option"
              aria-selected={i === current}
              className={`flex cursor-pointer gap-2 px-3 py-1 ${i === current ? 'bg-neutral-800' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h)
              }}
            >
              <span className="truncate text-neutral-100">{h.rel}</span>
              <span className="ml-auto shrink-0 text-neutral-500">{h.projectName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

Em `App.tsx`, renderizar `<QuickOpen />` como último filho da grid.

- [ ] **Step 5: E2E**

```ts
// e2e/quickopen.spec.ts
import { expect, test } from '@playwright/test'
import { fixtureProject, launch } from './helpers'

test('Cmd+P busca arquivos em todos os projetos e abre o escolhido', async () => {
  const { folder } = fixtureProject('proj-quick-')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()

  await page.keyboard.press('Meta+p')
  const search = page.getByRole('textbox', { name: 'Buscar arquivo' })
  await expect(search).toBeFocused()
  await search.fill('app')
  await expect(page.getByRole('listbox', { name: 'Arquivos encontrados' }).getByRole('option').first()).toContainText('src/app.ts')
  await search.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(0)

  await page.keyboard.press('Meta+p')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(0)
  await app.close()
})
```

- [ ] **Step 6: Verificar** — `npx vitest run && npm run typecheck && npm run test:e2e -- quickopen shortcuts` → verde.

- [ ] **Step 7: Commit** — `git add -A src test e2e && git commit -m "feat: add Cmd+P quick open across projects"`

---

### Task 9: Terminal — reiniciar e buscar (`Cmd+F`)

**Files:**
- Create: `src/renderer/src/panels/terminal/TerminalSearch.tsx`
- Modify: `src/renderer/src/panels/terminal/terminalRegistry.ts`, `src/renderer/src/panels/terminal/TerminalPanel.tsx`
- Test: `e2e/terminal-extras.spec.ts`

**Interfaces:**
- Consumes: `@xterm/addon-search` (Task 1), `useSessions` (Plano 1).
- Produces: `TerminalEntry` ganha `search: SearchAddon` e `restart(): void`.

- [ ] **Step 1: Registry** — em `terminalRegistry.ts`:

```ts
import { SearchAddon } from '@xterm/addon-search'

export type TerminalEntry = { term: Terminal; host: HTMLDivElement; search: SearchAddon; fit(): void; restart(): void }
// Terminal options: acrescentar `allowProposedApi: true` (as decorações da busca usam a API de decorations).
// depois do WebLinksAddon:
  const search = new SearchAddon()
  term.loadAddon(search)
// trocar o bloco `window.api.invoke('pty:create', …)` por:
  const spawn = (command?: string) =>
    window.api
      .invoke('pty:create', panelId, cwd, term.cols, term.rows)
      .then(() => {
        if (command) return window.api.invoke('pty:write', panelId, `${command}\r`)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        term.write(`\r\n\x1b[31m[falha ao iniciar o terminal: ${message}]\x1b[0m\r\n`)
        useSessions.getState().setState(panelId, 'error')
      })
  void spawn(initialCommand)
// no objeto entry:
    search,
    restart: () => {
      term.write('\r\n\x1b[2m[reiniciando…]\x1b[0m\r\n')
      useSessions.getState().setState(panelId, 'idle')
      void spawn()
    },
```

`PtyManager.create` já mata um pty anterior do mesmo `panelId` e aceita recriar depois do `exit`, então o main não muda.

- [ ] **Step 2: Barra de busca**

```tsx
// src/renderer/src/panels/terminal/TerminalSearch.tsx
import { useEffect, useState } from 'react'
import type { TerminalEntry } from './terminalRegistry'

const OPTIONS = {
  decorations: {
    matchBackground: '#525252',
    matchOverviewRuler: '#a3a3a3',
    activeMatchBackground: '#c2410c',
    activeMatchColorOverviewRuler: '#fb923c',
  },
}

export function TerminalSearch({ entry, onClose }: { entry: TerminalEntry; onClose(): void }) {
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<{ index: number; count: number } | null>(null)

  useEffect(() => {
    const sub = entry.search.onDidChangeResults((e) => setResult({ index: e.resultIndex, count: e.resultCount }))
    return () => {
      sub.dispose()
      entry.search.clearDecorations()
    }
  }, [entry])

  const find = (value: string, backwards = false) => {
    if (!value) {
      entry.search.clearDecorations()
      setResult(null)
      return
    }
    if (backwards) entry.search.findPrevious(value, OPTIONS)
    else entry.search.findNext(value, OPTIONS)
  }

  const label = !result ? '' : result.count === 0 ? 'sem resultados' : result.index < 0 ? `${result.count}+` : `${result.index + 1}/${result.count}`

  return (
    <div className="absolute top-2 right-4 z-10 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs shadow-lg">
      <input
        autoFocus
        aria-label="Buscar no terminal"
        className="w-48 bg-transparent text-neutral-100 outline-none"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          find(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            find(term, e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span data-testid="terminal-search-count" className="min-w-16 text-neutral-400">
        {label}
      </span>
      <button aria-label="Fechar busca" className="text-neutral-500 hover:text-neutral-200" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 3: TerminalPanel**

```tsx
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { TerminalPanelParams } from '@shared/models'
import { replacementPatch } from '../../dock/panelParams'
import { useSessions } from '../../stores/sessionsStore'
import { attachTerminal, type TerminalEntry } from './terminalRegistry'
import { TerminalSearch } from './TerminalSearch'
import { withoutInitialCommand } from './terminalParams'

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const ref = useRef<HTMLDivElement>(null)
  const [entry, setEntry] = useState<TerminalEntry | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const state = useSessions((s) => s.byId[api.id]?.state)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const attached = attachTerminal(api.id, params.projectPath, container, params.initialCommand)
    setEntry(attached)
    // One-shot: strip it from the persisted params so a relaunch never replays it.
    // dockview's updateParameters merges into the existing params object, so an
    // omitted key is not enough to clear it — replacementPatch explicitly
    // undefines it, which dockview's merge treats as a delete.
    if (params.initialCommand) api.updateParameters(replacementPatch(params, withoutInitialCommand(params)))
    const observer = new ResizeObserver(() => attached.fit())
    observer.observe(container)
    attached.fit()
    const active = api.onDidActiveChange((e) => {
      if (!e.isActive) return
      attached.fit()
      attached.term.focus()
    })
    return () => {
      observer.disconnect()
      active.dispose()
      // A newer mount may already have re-adopted this terminal's host into its own
      // container (e.g. under StrictMode's double-invoke); only remove it if it is
      // still ours to remove.
      if (attached.host.parentElement === container) attached.host.remove()
    }
  }, [api, params.projectPath])

  return (
    <div
      className="relative h-full w-full"
      onKeyDownCapture={(e) => {
        if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          e.stopPropagation()
          setSearchOpen(true)
        }
      }}
    >
      <div ref={ref} data-testid="terminal" className="h-full w-full overflow-hidden bg-[#0a0a0a] p-1" />
      {searchOpen && entry && (
        <TerminalSearch
          entry={entry}
          onClose={() => {
            setSearchOpen(false)
            entry.term.focus()
          }}
        />
      )}
      {(state === 'exited' || state === 'error') && entry && (
        <button
          className="absolute right-4 bottom-4 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-100 shadow hover:bg-neutral-700"
          onClick={() => {
            entry.restart()
            entry.term.focus()
          }}
        >
          Reiniciar terminal
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: E2E**

```ts
// e2e/terminal-extras.spec.ts
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('terminal busca com Cmd+F e reinicia depois de sair', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-term2-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()

  const terminal = page.getByTestId('terminal')
  await terminal.click()
  await page.keyboard.type('echo marcador-unico\n')
  await expect(terminal.locator('.xterm-rows')).toContainText('marcador-unico', { timeout: 15_000 })

  await page.keyboard.press('Meta+f')
  const search = page.getByRole('textbox', { name: 'Buscar no terminal' })
  await expect(search).toBeFocused()
  await search.fill('marcador-unico')
  await expect(page.getByTestId('terminal-search-count')).toHaveText(/\d+\/\d+/)
  await search.press('Escape')
  await expect(search).toHaveCount(0)

  await terminal.click()
  await page.keyboard.type('exit\n')
  const restart = page.getByRole('button', { name: 'Reiniciar terminal' })
  await expect(restart).toBeVisible({ timeout: 15_000 })
  await restart.click()
  await expect(restart).toHaveCount(0)
  await page.keyboard.type('echo de-volta\n')
  await expect(terminal.locator('.xterm-rows')).toContainText('de-volta', { timeout: 15_000 })
  await app.close()
})
```

- [ ] **Step 5: Verificar** — `npm run typecheck && npx vitest run && npm run test:e2e -- terminal terminal-extras restore` → verde.

- [ ] **Step 6: Commit** — `git add -A src e2e && git commit -m "feat: add terminal restart button and Cmd+F search"`

---

### Task 10: Reordenar workspaces arrastando

**Files:**
- Modify: `src/renderer/src/stores/workspaceStore.ts`, `src/renderer/src/sidebar/WorkspaceSection.tsx`, `src/renderer/src/sidebar/Sidebar.tsx`
- Test: `e2e/workspace-reorder.spec.ts` (a lógica pura `moveWorkspaceById` já foi testada na Task 3)

**Interfaces:**
- Consumes: `moveWorkspaceById` (Task 3).
- Produces: `useWorkspaces.move(id: string, targetId: string): void`; `WorkspaceSection` recebe `draggable: boolean`.

- [ ] **Step 1: Store** — em `workspaceStore.ts`: tipo `move(id: string, targetId: string): void`; implementação `move: (id, targetId) => commit(moveWorkspaceById(get().workspaces, id, targetId))` (importar `moveWorkspaceById`).

- [ ] **Step 2: Cabeçalho arrastável** — em `WorkspaceSection.tsx`:

```tsx
const DRAG_TYPE = 'application/x-next-ide-workspace'

export function WorkspaceSection({ workspace, draggable }: { workspace: Workspace; draggable: boolean }) {
  const { toggle, rename, remove, addFolder, removeProject, move } = useWorkspaces.getState()
  const [dropTarget, setDropTarget] = useState(false)
  // ...estado existente...
  return (
    <div className="pb-1">
      <div
        data-testid="workspace-header"
        draggable={draggable && !editing}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, workspace.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDropTarget(true)
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(e) => {
          setDropTarget(false)
          const id = e.dataTransfer.getData(DRAG_TYPE)
          if (!id || id === workspace.id) return
          e.preventDefault()
          move(id, workspace.id)
        }}
        className={`group flex items-center gap-1 rounded px-2 py-1 hover:bg-neutral-800/50 ${dropTarget ? 'ring-1 ring-orange-500/60' : ''}`}
      >
        {/* conteúdo atual do cabeçalho, sem mudanças */}
      </div>
      {/* projetos, sem mudanças */}
    </div>
  )
}
```

Em `Sidebar.tsx`: `<WorkspaceSection key={w.id} workspace={w} draggable={!query.trim()} />` (com filtro ativo a lista visível não é a lista real, então arrastar fica desligado).

- [ ] **Step 3: E2E**

```ts
// e2e/workspace-reorder.spec.ts
import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('reordena workspaces arrastando e mantém a ordem ao reabrir', async () => {
  const first = await launch()
  for (const name of ['alfa', 'beta']) {
    await first.page.getByRole('button', { name: 'Novo workspace' }).click()
    await first.page.getByPlaceholder('Nome do workspace').fill(name)
    await first.page.getByPlaceholder('Nome do workspace').press('Enter')
  }
  const headers = first.page.getByTestId('workspace-header')
  await expect(headers).toHaveText([/alfa/, /beta/])
  await headers.filter({ hasText: 'beta' }).dragTo(headers.filter({ hasText: 'alfa' }))
  await expect(headers).toHaveText([/beta/, /alfa/])
  await first.app.close()

  const second = await launch({ userData: first.userData })
  await expect(second.page.getByTestId('workspace-header')).toHaveText([/beta/, /alfa/])
  await second.app.close()
})
```

- [ ] **Step 4: Verificar** — `npm run typecheck && npx vitest run && npm run test:e2e -- workspace-reorder sidebar` → verde.

- [ ] **Step 5: Commit** — `git add -A src e2e && git commit -m "feat: reorder workspaces by dragging"`

---

### Task 11: Verificação final e documentação

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-next-ide-mvp-design.md` (só se algum comportamento divergiu), memória do projeto fora do repo

- [ ] **Step 1: Suíte completa** — `npm run typecheck && npx vitest run && npm run test:e2e` → tudo verde (os E2E dos Planos 1 e 2 incluídos).

- [ ] **Step 2: Build de produção e CSP** — `npm run build` e conferir que `out/renderer/index.html` ainda tem a mesma CSP (sem `wasm-unsafe-eval`), e `ls out/renderer/assets` mostra chunks de linguagem do shiki.

- [ ] **Step 3: Smoke manual (usuário)** — `npm run dev`, adicionar um repo real grande (ex.: o próprio next-ide): expandir árvore (sem `node_modules`/`out`), `Cmd+P`, abrir arquivo `.tsx`, selecionar linhas e "Mencionar no agente", clicar num caminho de cartão Edit, `Cmd+F` no terminal, `exit` + reiniciar, arrastar workspace.

- [ ] **Step 4: Commit** (se houve ajuste de doc) — `git commit -am "docs: sync spec with plan 3 behavior"`

---

## Cobertura do spec

| Spec | Requisito | Task |
|------|-----------|------|
| §7 | Árvore lazy, oculta `.git`/`node_modules`/gitignore | 1, 4 |
| §7 | Cores de `git status --porcelain` (M/U/A/D) | 2, 4 |
| §7 | Atualiza via `fs.watch` recursivo com debounce | 3, 4 |
| §7 | Filtro fuzzy de arquivos com projeto expandido | 4 |
| §7 | `Cmd+P` fuzzy em todos os projetos, índice sob demanda, respeita gitignore | 2, 8 |
| §7 | Reordenar workspaces por drag (pendência do Plano 1) | 10 |
| §6.6 | Branch atualiza em watch de `.git/HEAD` | 3, 4 |
| §6.2 | Caminhos em cartões abrem FilePanel na linha | 7 |
| §6.3 | `@` autocomplete (mesma fonte do Cmd+P) | 6 |
| §9 | Addon search (`Cmd+F`) | 9 |
| §9 | "processo encerrado" + botão reiniciar (pendência do Plano 1) | 9 |
| §10 | Somente leitura, shiki, numeração, rolar até `line` | 5 |
| §10 | Imagens → preview; binário/>2 MB → aviso | 1, 5 |
| §10 | "Mencionar no agente" com `#L10-20`; sem agente abre novo | 5, 6 |
| §10 | Atualiza quando o arquivo muda em disco | 3, 5 |
| §11 | `fs:list`, `fs:read`, `fs:index`, `fs:changed`, `git:changed` | 3 |
