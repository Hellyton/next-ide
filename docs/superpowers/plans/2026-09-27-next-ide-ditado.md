# Ditado por voz no composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão 🎤 no composer do painel do agente que transcreve a fala (pt-BR, no próprio Mac) direto no campo de texto, sem enviar sozinho.

**Architecture:** Um helper Swift de linha de comando (`next-ide-dictation`) captura o microfone e transcreve com `SpeechAnalyzer` + `SpeechTranscriber` (macOS 26+), emitindo JSON por linha no stdout. O `DictationManager` no main faz spawn/stop do helper e repassa eventos ao renderer por IPC (`dictation:event`). No renderer, um `dictationStore` aplica a transcrição ao draft do painel (`agentStore.setDraft`) e o `Composer` mostra o botão e trava o textarea enquanto grava.

**Tech Stack:** Swift (AVFoundation, Speech), Electron 44 main (`child_process.spawn`), React 19 + zustand 5, vitest 5, Playwright 1.63, electron-builder 26.

**Spec:** `docs/superpowers/specs/2026-09-27-next-ide-ditado-design.md`

## Global Constraints

- Motor: `SpeechAnalyzer` + `SpeechTranscriber`, modo local; locale fixo `pt-BR` (helper aceita `--locale`).
- Nunca envia sozinho: parar a gravação só deixa o texto no campo. Enter/↑ com gravação ligada = para, espera o texto final (máx. 3 s) e envia.
- Só um painel grava por vez no app todo.
- Botão só aparece no macOS. `aria-label` "Ditado" / "Parar ditado".
- Texto entra na posição do cursor; textarea `readOnly` enquanto grava.
- Erros viram `composer-notice` (`useAgents.getState().setNotice(panelId, { text, command: '' })`).
- Stop: SIGTERM, SIGKILL se não sair em 3 s.
- Binário: dev `<appPath>/resources/bin/next-ide-dictation`; empacotado `process.resourcesPath/bin/next-ide-dictation`. `resources/bin/` fora do git.
- E2E usa `NEXT_IDE_E2E_FAKE_DICTATION=ok|error` (helper fake em Node), nunca microfone real.
- Textos da UI em português, código/comentários em inglês (padrão do repo).

## Review Focus

- Helper morre no meio da gravação (crash, sem linha `error`): UI tem que sair do modo gravando e mostrar aviso — teste no `DictationManager` (Task 3) + store (Task 4).
- Helper ignora SIGTERM: SIGKILL após 3 s no main, e o renderer destrava após 3 s mesmo sem `ended` — testes nas Tasks 3 e 4.
- Painel fechado durante a gravação: `agent:close` tem que parar o helper — teste em `handlers.test.ts` (Task 3).
- Stdout do helper chega partido no meio de uma linha JSON: buffer por linha — teste no `DictationManager` (Task 3).
- Gravar e parar sem falar nada: draft volta exatamente ao original, sem espaço sobrando — teste em `applyDictation` (Task 4).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/native/dictation/main.swift` (novo) | Helper: mic → SpeechAnalyzer → JSON no stdout |
| `scripts/build-dictation.mjs` (novo) | Compila o helper com `swiftc` para `resources/bin/` |
| `src/shared/dictation.ts` (novo) | Tipo `DictationEvent` + `parseDictationLine` |
| `src/shared/ipc-contract.ts` | Canais `dictation:start`, `dictation:stop`, evento `dictation:event` |
| `src/main/dictation/DictationManager.ts` (novo) | Spawn/stop, buffer de linhas, um painel por vez, SIGKILL |
| `src/main/ipc/handlers.ts` | Handlers novos; `agent:close` para o ditado |
| `src/main/index.ts` | Instancia o manager (real ou fake), para no quit |
| `test/fixtures/fakeDictation.mjs` (novo) | Helper fake para e2e |
| `src/renderer/src/agent/dictation.ts` (novo) | `beginDictation` / `applyDictation` (puro) |
| `src/renderer/src/stores/dictationStore.ts` (novo) | Estado da gravação, aplica eventos ao draft |
| `src/renderer/src/panels/agent/Composer.tsx` | Botão 🎤, readOnly, Enter durante gravação |
| `src/renderer/src/App.tsx` | Assina `dictation:event` |
| `package.json`, `electron-builder.yml`, `scripts/brand-electron.mjs`, `.gitignore` | Build, empacotamento, Info.plist |

---

### Task 1: Helper Swift + build + empacotamento

**Files:**
- Create: `src/native/dictation/main.swift`
- Create: `scripts/build-dictation.mjs`
- Modify: `package.json` (scripts), `.gitignore`, `electron-builder.yml`, `scripts/brand-electron.mjs`

**Interfaces:**
- Produces: binário `resources/bin/next-ide-dictation [--locale pt-BR]`. Stdout, uma linha JSON por evento:
  `{"type":"ready"}` · `{"type":"status","text":string}` · `{"type":"transcript","final":string,"volatile":string}` · `{"type":"error","message":string}`.
  SIGTERM/SIGINT → finaliza, emite último `transcript` com `volatile:""`, sai 0. Erro → emite `error`, sai 1.
  `final` já vem com os segmentos unidos por espaço; `volatile` vem com espaço inicial quando `final` não está vazio.

- [ ] **Step 1: Escrever o helper**

`src/native/dictation/main.swift`:

```swift
// next-ide dictation helper: captures the microphone, transcribes on-device with SpeechAnalyzer,
// and prints one JSON object per line on stdout. SIGTERM/SIGINT finalizes and exits 0.
import AVFoundation
import Foundation
import Speech

func emit(_ object: [String: String]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func fail(_ message: String) -> Never {
  emit(["type": "error", "message": message])
  exit(1)
}

func localeArgument() -> Locale {
  let args = CommandLine.arguments
  if let i = args.firstIndex(of: "--locale"), i + 1 < args.count { return Locale(identifier: args[i + 1]) }
  return Locale(identifier: "pt-BR")
}

@available(macOS 26.0, *)
final class Dictation {
  private let engine = AVAudioEngine()
  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var results: Task<Void, Error>?
  private var converter: AVAudioConverter?
  private var format: AVAudioFormat?
  private var finalText = ""
  private var volatileText = ""
  private var stopping = false

  func run(locale requested: Locale) async throws {
    if AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      if !granted { fail("Permissão de microfone negada. Libere em Ajustes do Sistema > Privacidade e Segurança > Microfone.") }
    }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
      fail("Idioma \(requested.identifier) não suportado pelo ditado do macOS.")
    }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      emit(["type": "status", "text": "baixando modelo de fala…"])
      try await request.downloadAndInstall()
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    self.analyzer = analyzer
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      fail("Formato de áudio indisponível para o ditado.")
    }
    self.format = format
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    input = continuation

    results = Task {
      for try await result in transcriber.results {
        let text = String(result.text.characters)
        if result.isFinal {
          self.finalText = Self.join(self.finalText, text)
          self.volatileText = ""
        } else {
          self.volatileText = self.finalText.isEmpty ? text : Self.join("", text, leadingSpace: true)
        }
        self.emitTranscript()
      }
    }

    try await analyzer.start(inputSequence: stream)

    let node = engine.inputNode
    let micFormat = node.outputFormat(forBus: 0)
    guard micFormat.sampleRate > 0 else { fail("Nenhum microfone encontrado.") }
    converter = AVAudioConverter(from: micFormat, to: format)
    converter?.primeMethod = .none
    node.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [weak self] buffer, _ in
      guard let self, let converted = self.convert(buffer) else { return }
      self.input?.yield(AnalyzerInput(buffer: converted))
    }
    engine.prepare()
    try engine.start()
    emit(["type": "ready"])
  }

  func stop() async {
    if stopping { return }
    stopping = true
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    input?.finish()
    try? await analyzer?.finalizeAndFinishThroughEndOfInput()
    _ = try? await results?.value
    volatileText = ""
    emitTranscript()
    exit(0)
  }

  private func emitTranscript() {
    emit(["type": "transcript", "final": finalText, "volatile": volatileText])
  }

  private static func join(_ base: String, _ piece: String, leadingSpace: Bool = false) -> String {
    let trimmed = piece.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return base }
    if base.isEmpty { return leadingSpace ? " " + trimmed : trimmed }
    return base + " " + trimmed
  }

  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let converter, let format else { return nil }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
    var consumed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil ? out : nil
  }
}

guard #available(macOS 26.0, *) else { fail("O ditado precisa do macOS 26 ou mais novo.") }

let dictation = Dictation()
var signalSources: [DispatchSourceSignal] = []
for sig in [SIGTERM, SIGINT] {
  signal(sig, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
  source.setEventHandler { Task { await dictation.stop() } }
  source.resume()
  signalSources.append(source)
}
Task {
  do {
    try await dictation.run(locale: localeArgument())
  } catch {
    fail("Falha no ditado: \(error.localizedDescription)")
  }
}
dispatchMain()
```

- [ ] **Step 2: Escrever o script de build**

`scripts/build-dictation.mjs`:

```js
// Compiles the Swift dictation helper into resources/bin. Skips (with a warning, never a failure)
// off macOS or without swiftc, so the rest of the app still builds; a real compile error fails.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'native', 'dictation', 'main.swift')
const out = join(root, 'resources', 'bin', 'next-ide-dictation')

if (process.platform !== 'darwin') {
  console.log('[next-ide] dictation helper skipped (not macOS)')
  process.exit(0)
}
if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) process.exit(0)
try {
  execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' })
} catch {
  console.warn('[next-ide] swiftc not found; dictation button will report the helper as missing')
  process.exit(0)
}
mkdirSync(dirname(out), { recursive: true })
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, src, '-o', out], { stdio: 'inherit' })
console.log(`[next-ide] built ${out}`)
```

- [ ] **Step 3: Compilar**

Run: `node scripts/build-dictation.mjs`
Expected: `[next-ide] built .../resources/bin/next-ide-dictation`, sem erros de compilação. Se o `swiftc` reclamar de uma API (nome/assinatura do SDK macOS 27), ajuste conforme a mensagem do compilador mantendo o protocolo de saída da seção **Interfaces**.

- [ ] **Step 4: Spike manual no Terminal (usuário fala)**

Run (no Terminal do usuário, não em subagente): `resources/bin/next-ide-dictation --locale pt-BR`
Fale "teste de ditado do next ide", depois Ctrl+C.
Expected: prompt de microfone para o Terminal na primeira vez; linhas `{"type":"ready"}`, vários `transcript` com `volatile` mudando, e um último `transcript` com `volatile:""` e o texto falado em `final`; processo sai com código 0 (`echo $?`).
Se a transcrição falhar com erro de autorização de fala: adicionar em `run()`, antes do `supportedLocale`, um `SFSpeechRecognizer.requestAuthorization` que chama `fail("Permissão de reconhecimento de fala negada…")` quando o status não for `.authorized`, recompilar e repetir. Registrar o resultado (precisa ou não) na mensagem do commit.

- [ ] **Step 5: Ligar build, gitignore e empacotamento**

`package.json` — scripts (substituir as linhas existentes de `dev`, `build`, `package`, `dist` e adicionar `build:dictation`):

```json
    "dev": "npm run build:dictation && electron-vite dev",
    "build": "npm run build:dictation && electron-vite build",
    "build:dictation": "node scripts/build-dictation.mjs",
    "package": "npm run build:dictation && electron-vite build && electron-builder --dir",
    "dist": "npm run build:dictation && electron-vite build && electron-builder"
```

`.gitignore` — acrescentar a linha:

```
resources/bin/
```

`electron-builder.yml` — acrescentar no nível raiz, depois de `asarUnpack`:

```yaml
# Swift dictation helper (built by scripts/build-dictation.mjs), shipped next to app.asar.
extraResources:
  - from: resources/bin
    to: bin
```

e dentro de `mac.extendInfo`, junto de `LSUIElement`:

```yaml
    NSMicrophoneUsageDescription: O next-ide usa o microfone para o ditado por voz no composer.
    NSSpeechRecognitionUsageDescription: O next-ide transcreve sua fala no próprio Mac para o ditado por voz.
```

`scripts/brand-electron.mjs` — logo após a linha do `CFBundleExecutable` (antes do `writeFileSync(join(electronDir, 'path.txt')…`):

```js
// Dictation: macOS credits mic/speech access to this bundle (the helper's parent) and refuses
// without usage strings in its Info.plist.
execFileSync('plutil', ['-replace', 'NSMicrophoneUsageDescription', '-string', 'O next-ide usa o microfone para o ditado por voz no composer.', plist])
execFileSync('plutil', ['-replace', 'NSSpeechRecognitionUsageDescription', '-string', 'O next-ide transcreve sua fala no próprio Mac para o ditado por voz.', plist])
```

Run: `npm run brand && plutil -p node_modules/electron/dist/Electron.app/Contents/Info.plist | grep -E "Microphone|SpeechRecognition"`
Expected: as duas chaves com os textos acima.

- [ ] **Step 6: Commit**

```bash
git add src/native/dictation/main.swift scripts/build-dictation.mjs scripts/brand-electron.mjs package.json .gitignore electron-builder.yml
git commit -m "feat: Swift dictation helper (SpeechAnalyzer, on-device) with build and packaging"
```

---

### Task 2: Contrato compartilhado (`DictationEvent`, parser, IPC)

**Files:**
- Create: `src/shared/dictation.ts`
- Modify: `src/shared/ipc-contract.ts`
- Test: `test/shared/dictation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DictationEvent =
    | { type: 'ready' }
    | { type: 'status'; text: string }
    | { type: 'transcript'; final: string; volatile: string }
    | { type: 'error'; message: string }
    | { type: 'ended' }
  export function parseDictationLine(line: string): DictationEvent | null
  ```
  IPC: `'dictation:start': { args: [panelId: string]; result: Outcome<null> }`, `'dictation:stop': { args: [panelId: string]; result: void }`, evento `'dictation:event': [panelId: string, event: DictationEvent]`.

- [ ] **Step 1: Teste falhando**

`test/shared/dictation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseDictationLine } from '@shared/dictation'

describe('parseDictationLine', () => {
  it('parses every helper event', () => {
    expect(parseDictationLine('{"type":"ready"}')).toEqual({ type: 'ready' })
    expect(parseDictationLine('{"type":"status","text":"baixando"}')).toEqual({ type: 'status', text: 'baixando' })
    expect(parseDictationLine('{"type":"transcript","final":"abre","volatile":" o"}')).toEqual({ type: 'transcript', final: 'abre', volatile: ' o' })
    expect(parseDictationLine('{"type":"error","message":"sem mic"}')).toEqual({ type: 'error', message: 'sem mic' })
  })

  it('trims surrounding whitespace', () => {
    expect(parseDictationLine('  {"type":"ready"}\r')).toEqual({ type: 'ready' })
  })

  it('rejects garbage, unknown types, missing fields and main-only events', () => {
    expect(parseDictationLine('')).toBeNull()
    expect(parseDictationLine('not json')).toBeNull()
    expect(parseDictationLine('[1]')).toBeNull()
    expect(parseDictationLine('null')).toBeNull()
    expect(parseDictationLine('{"type":"bogus"}')).toBeNull()
    expect(parseDictationLine('{"type":"transcript","final":"a"}')).toBeNull()
    expect(parseDictationLine('{"type":"status","text":3}')).toBeNull()
    expect(parseDictationLine('{"type":"error"}')).toBeNull()
    expect(parseDictationLine('{"type":"ended"}')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/shared/dictation.test.ts`
Expected: FAIL (módulo `@shared/dictation` não existe).

- [ ] **Step 3: Implementar**

`src/shared/dictation.ts`:

```ts
/** Events the renderer gets on `dictation:event`. All but `ended` come from the helper's stdout; main adds `ended` when it exits. */
export type DictationEvent =
  | { type: 'ready' }
  | { type: 'status'; text: string }
  | { type: 'transcript'; final: string; volatile: string }
  | { type: 'error'; message: string }
  | { type: 'ended' }

/** Parses one stdout line of the Swift helper; anything malformed (or main-only) is null. */
export function parseDictationLine(line: string): DictationEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(line.trim())
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  switch (o.type) {
    case 'ready':
      return { type: 'ready' }
    case 'status':
      return typeof o.text === 'string' ? { type: 'status', text: o.text } : null
    case 'transcript':
      return typeof o.final === 'string' && typeof o.volatile === 'string' ? { type: 'transcript', final: o.final, volatile: o.volatile } : null
    case 'error':
      return typeof o.message === 'string' ? { type: 'error', message: o.message } : null
    default:
      return null
  }
}
```

`src/shared/ipc-contract.ts`:
- Adicionar o import: `import type { DictationEvent } from './dictation'`
- Em `InvokeMap`, antes de `'statusline:run'`:
  ```ts
  'dictation:start': { args: [panelId: string]; result: Outcome<null> }
  'dictation:stop': { args: [panelId: string]; result: void }
  ```
- Em `EventMap`, no fim: `'dictation:event': [panelId: string, event: DictationEvent]`
- Em `INVOKE_CHANNELS`, antes de `'statusline:run'`: `'dictation:start',` e `'dictation:stop',`
- Em `EVENT_CHANNELS`, acrescentar `'dictation:event'` no fim da lista.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/shared/dictation.test.ts`
Expected: PASS. (`npm run typecheck` ainda falha em `handlers.ts` por faltar os handlers novos — resolvido na Task 3; não commitar sem rodar a Task 3 se o executor exigir typecheck verde por commit, nesse caso juntar o commit com a Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/dictation.ts src/shared/ipc-contract.ts test/shared/dictation.test.ts
git commit -m "feat: dictation IPC contract and helper line parser"
```

---

### Task 3: `DictationManager` no main + handlers + helper fake

**Files:**
- Create: `src/main/dictation/DictationManager.ts`
- Create: `test/fixtures/fakeDictation.mjs`
- Modify: `src/main/ipc/handlers.ts` (deps + 2 handlers + `agent:close`)
- Modify: `src/main/index.ts` (instância + quit)
- Test: `test/main/DictationManager.test.ts`, `test/main/handlers.test.ts`

**Interfaces:**
- Consumes: `DictationEvent`, `parseDictationLine` (Task 2); `Outcome` de `@shared/agent`.
- Produces:
  ```ts
  export interface ChildLike {
    stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null
    on(event: 'exit', cb: (code: number | null) => void): unknown
    on(event: 'error', cb: (err: Error) => void): unknown
    kill(signal?: NodeJS.Signals): boolean
  }
  export type DictationDeps = {
    spawn: () => ChildLike
    exists: () => boolean
    emit: (panelId: string, event: DictationEvent) => void
    killTimeoutMs?: number // default 3000
  }
  export class DictationManager {
    start(panelId: string): Outcome<null>
    stop(panelId: string): void
    stopAll(): void
  }
  ```
  `HandlerDeps.dictation: Pick<DictationManager, 'start' | 'stop'>`.

- [ ] **Step 1: Teste falhando do manager**

`test/main/DictationManager.test.ts`:

```ts
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DictationEvent } from '@shared/dictation'
import { DictationManager, type ChildLike } from '../../src/main/dictation/DictationManager'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  signals: string[] = []
  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.signals.push(signal)
    return true
  }
  out(text: string) {
    this.stdout.emit('data', Buffer.from(text))
  }
}

function setup(over: { exists?: boolean; spawnThrows?: boolean } = {}) {
  const children: FakeChild[] = []
  const events: Array<[string, DictationEvent]> = []
  const mgr = new DictationManager({
    exists: () => over.exists ?? true,
    spawn: () => {
      if (over.spawnThrows) throw new Error('spawn EACCES')
      const c = new FakeChild()
      children.push(c)
      return c as unknown as ChildLike
    },
    emit: (id, e) => events.push([id, e]),
  })
  return { mgr, children, events }
}

describe('DictationManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('forwards parsed helper lines, even when a line arrives in pieces', () => {
    const { mgr, children, events } = setup()
    expect(mgr.start('p1')).toEqual({ ok: true, value: null })
    children[0]!.out('{"type":"ready"}\n{"type":"transcript","final":"ab')
    children[0]!.out('re","volatile":""}\nlixo\n')
    expect(events).toEqual([
      ['p1', { type: 'ready' }],
      ['p1', { type: 'transcript', final: 'abre', volatile: '' }],
    ])
  })

  it('stop sends SIGTERM and emits ended when the helper exits cleanly', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    children[0]!.emit('exit', 0)
    expect(events).toEqual([['p1', { type: 'ended' }]])
  })

  it('SIGKILLs a helper that ignores SIGTERM for 3s', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    vi.advanceTimersByTime(2999)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    vi.advanceTimersByTime(1)
    expect(children[0]!.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  it('does not SIGKILL after the helper already exited', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p1')
    children[0]!.emit('exit', 0)
    vi.advanceTimersByTime(5000)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
  })

  it('a crash without an error line still reports an error, then ended', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.emit('exit', 1)
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'O ditado parou inesperadamente (código 1).' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('an exit after an error line does not add a second error', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.out('{"type":"error","message":"Permissão negada"}\n')
    children[0]!.emit('exit', 1)
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'Permissão negada' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('a spawn error event reports it and ends', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    children[0]!.emit('error', new Error('spawn ENOENT'))
    expect(events).toEqual([
      ['p1', { type: 'error', message: 'Falha ao iniciar o ditado: spawn ENOENT' }],
      ['p1', { type: 'ended' }],
    ])
  })

  it('starting on another panel stops the first; only one records', () => {
    const { mgr, children, events } = setup()
    mgr.start('p1')
    mgr.start('p2')
    expect(children).toHaveLength(2)
    expect(children[0]!.signals).toEqual(['SIGTERM'])
    children[0]!.emit('exit', 0)
    children[1]!.out('{"type":"ready"}\n')
    expect(events).toEqual([
      ['p1', { type: 'ended' }],
      ['p2', { type: 'ready' }],
    ])
  })

  it('starting again on the recording panel is a no-op', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    expect(mgr.start('p1')).toEqual({ ok: true, value: null })
    expect(children).toHaveLength(1)
  })

  it('stop for a panel that is not recording does nothing', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stop('p2')
    expect(children[0]!.signals).toEqual([])
  })

  it('reports a missing helper binary without spawning', () => {
    const { mgr, children } = setup({ exists: false })
    expect(mgr.start('p1')).toEqual({ ok: false, message: 'Helper de ditado não encontrado (rode npm run build:dictation).' })
    expect(children).toHaveLength(0)
  })

  it('reports a throwing spawn', () => {
    const { mgr } = setup({ spawnThrows: true })
    expect(mgr.start('p1')).toEqual({ ok: false, message: 'spawn EACCES' })
  })

  it('stopAll stops the active helper', () => {
    const { mgr, children } = setup()
    mgr.start('p1')
    mgr.stopAll()
    expect(children[0]!.signals).toEqual(['SIGTERM'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/main/DictationManager.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o manager**

`src/main/dictation/DictationManager.ts`:

```ts
import type { Outcome } from '@shared/agent'
import { parseDictationLine, type DictationEvent } from '@shared/dictation'

export interface ChildLike {
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null
  on(event: 'exit', cb: (code: number | null) => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

export type DictationDeps = {
  spawn: () => ChildLike
  exists: () => boolean
  emit: (panelId: string, event: DictationEvent) => void
  killTimeoutMs?: number
}

type Recording = { panelId: string; child: ChildLike; sawError: boolean; ended: boolean; killTimer: ReturnType<typeof setTimeout> | null }

/** Runs the Swift dictation helper for one panel at a time and relays its stdout as events. */
export class DictationManager {
  private active: Recording | null = null

  constructor(private readonly deps: DictationDeps) {}

  start(panelId: string): Outcome<null> {
    if (this.active?.panelId === panelId) return { ok: true, value: null }
    if (this.active) this.stop(this.active.panelId)
    if (!this.deps.exists()) return { ok: false, message: 'Helper de ditado não encontrado (rode npm run build:dictation).' }
    let child: ChildLike
    try {
      child = this.deps.spawn()
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
    const rec: Recording = { panelId, child, sawError: false, ended: false, killTimer: null }
    this.active = rec
    let buffer = ''
    child.stdout?.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = parseDictationLine(line)
        if (!event) {
          console.error('[next-ide] dictation: ignoring line', line)
          continue
        }
        if (event.type === 'error') rec.sawError = true
        this.deps.emit(panelId, event)
      }
    })
    child.on('exit', (code) => {
      if (code !== 0 && code !== null && !rec.sawError) {
        this.deps.emit(panelId, { type: 'error', message: `O ditado parou inesperadamente (código ${code}).` })
      }
      this.end(rec)
    })
    child.on('error', (err) => {
      rec.sawError = true
      this.deps.emit(panelId, { type: 'error', message: `Falha ao iniciar o ditado: ${err.message}` })
      this.end(rec)
    })
    return { ok: true, value: null }
  }

  stop(panelId: string): void {
    const rec = this.active
    if (!rec || rec.panelId !== panelId) return
    this.active = null
    rec.child.kill('SIGTERM')
    rec.killTimer = setTimeout(() => {
      if (!rec.ended) rec.child.kill('SIGKILL')
    }, this.deps.killTimeoutMs ?? 3000)
  }

  stopAll(): void {
    if (this.active) this.stop(this.active.panelId)
  }

  private end(rec: Recording): void {
    if (rec.ended) return
    rec.ended = true
    if (rec.killTimer) clearTimeout(rec.killTimer)
    if (this.active === rec) this.active = null
    this.deps.emit(rec.panelId, { type: 'ended' })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/main/DictationManager.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Teste falhando dos handlers**

Em `test/main/handlers.test.ts`, dentro de `deps()`:
- no tipo de retorno acrescentar `dictationCalls: string[]` → `HandlerDeps & { ptyCalls: unknown[][]; agentEvents: Array<[string, AgentEvent]>; dictationCalls: string[] }`
- declarar `const dictationCalls: string[] = []` junto dos outros arrays
- no objeto, antes de `ptyCalls,`:
  ```ts
    dictation: {
      start: (id) => {
        dictationCalls.push(`start:${id}`)
        return { ok: true, value: null }
      },
      stop: (id) => void dictationCalls.push(`stop:${id}`),
    },
    dictationCalls,
  ```

E um bloco novo no fim do arquivo:

```ts
describe('buildHandlers (dictation)', () => {
  it('forwards start/stop to the dictation manager', async () => {
    const d = deps()
    const h = buildHandlers(d)
    expect(await h['dictation:start']('p1')).toEqual({ ok: true, value: null })
    await h['dictation:stop']('p1')
    expect(d.dictationCalls).toEqual(['start:p1', 'stop:p1'])
  })

  it('closing an agent panel stops its dictation', async () => {
    const d = deps()
    await buildHandlers(d)['agent:close']('p1')
    expect(d.dictationCalls).toEqual(['stop:p1'])
  })
})
```

Run: `npx vitest run test/main/handlers.test.ts`
Expected: FAIL (`h['dictation:start']` não é função / `dictationCalls` vazio).

- [ ] **Step 6: Implementar os handlers**

`src/main/ipc/handlers.ts`:
- import: `import type { DictationManager } from '../dictation/DictationManager'`
- em `HandlerDeps`, depois de `notificationsEnabled`:
  ```ts
  dictation: Pick<DictationManager, 'start' | 'stop'>
  ```
- trocar `'agent:close': (panelId) => d.agents.close(panelId),` por:
  ```ts
    'agent:close': (panelId) => {
      d.dictation.stop(panelId)
      return d.agents.close(panelId)
    },
    'dictation:start': (panelId) => d.dictation.start(panelId),
    'dictation:stop': (panelId) => d.dictation.stop(panelId),
  ```

Run: `npx vitest run test/main/handlers.test.ts`
Expected: PASS.

- [ ] **Step 7: Helper fake para e2e**

`test/fixtures/fakeDictation.mjs`:

```js
// Stand-in for the Swift dictation helper in E2E (NEXT_IDE_E2E_FAKE_DICTATION=ok|error).
// Same stdout protocol; no microphone.
const mode = process.argv[2] ?? 'ok'
const emit = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

if (mode === 'error') {
  emit({ type: 'error', message: 'Permissão de microfone negada.' })
  process.exit(1)
}

emit({ type: 'ready' })
setTimeout(() => emit({ type: 'transcript', final: '', volatile: 'abre o' }), 50)
setTimeout(() => emit({ type: 'transcript', final: 'abre o arquivo', volatile: '' }), 100)
const finish = () => {
  emit({ type: 'transcript', final: 'abre o arquivo de config', volatile: '' })
  process.exit(0)
}
process.on('SIGTERM', finish)
process.on('SIGINT', finish)
setInterval(() => undefined, 1000)
```

- [ ] **Step 8: Ligar no main**

`src/main/index.ts`:
- imports: acrescentar `import { spawn } from 'node:child_process'`, trocar `import { watch } from 'node:fs'` por `import { existsSync, watch } from 'node:fs'`, e `import { DictationManager } from './dictation/DictationManager'`.
- depois do bloco `const agents = new AgentManager({...})`:
  ```ts
  // Swift helper built by scripts/build-dictation.mjs; E2E swaps in a Node fake with the same protocol.
  const FAKE_DICTATION = process.env.NEXT_IDE_E2E_FAKE_DICTATION
  const dictationBin = app.isPackaged
    ? join(process.resourcesPath, 'bin', 'next-ide-dictation')
    : join(app.getAppPath(), 'resources', 'bin', 'next-ide-dictation')
  const dictation = new DictationManager({
    exists: () => Boolean(FAKE_DICTATION) || existsSync(dictationBin),
    spawn: () =>
      FAKE_DICTATION
        ? spawn(process.execPath, [join(app.getAppPath(), 'test', 'fixtures', 'fakeDictation.mjs'), FAKE_DICTATION], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: ['ignore', 'pipe', 'inherit'],
          })
        : spawn(dictationBin, ['--locale', 'pt-BR'], { stdio: ['ignore', 'pipe', 'inherit'] }),
    emit: (panelId, event) => send('dictation:event', panelId, event),
  })
  ```
- em `buildHandlers({...})`, depois de `notificationsEnabled: () => notificationsEnabled,`: `dictation,`
- no `before-quit`, depois do `try { ptys.killAll() } ...`:
  ```ts
    try {
      dictation.stopAll()
    } catch (err) {
      console.error('[next-ide] stopping dictation failed', err)
    }
  ```

Run: `npm run typecheck && npx vitest run`
Expected: typecheck sem erros; suíte toda verde.

- [ ] **Step 9: Commit**

```bash
git add src/main/dictation/DictationManager.ts src/main/ipc/handlers.ts src/main/index.ts test/main/DictationManager.test.ts test/main/handlers.test.ts test/fixtures/fakeDictation.mjs
git commit -m "feat: DictationManager runs the helper per panel and relays events over IPC"
```

---

### Task 4: Renderer — lógica pura + `dictationStore`

**Files:**
- Create: `src/renderer/src/agent/dictation.ts`
- Create: `src/renderer/src/stores/dictationStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `test/renderer/dictation.test.ts`, `test/renderer/dictationStore.test.ts`

**Interfaces:**
- Consumes: `DictationEvent` (Task 2); IPC `dictation:start|stop`, evento `dictation:event`; `useAgents.getState().setDraft/setNotice`.
- Produces:
  ```ts
  // agent/dictation.ts
  export type DictationSnapshot = { original: string; originalCaret: number; prefix: string; suffix: string }
  export function beginDictation(text: string, caret: number): DictationSnapshot
  export function applyDictation(s: DictationSnapshot, final: string, volatile: string): { text: string; caret: number }
  // stores/dictationStore.ts
  export const STOP_TIMEOUT_MS = 3000
  export const useDictation: UseBoundStore<StoreApi<{
    active: string | null; stopping: boolean; status: string | null
    snapshot: DictationSnapshot | null; caret: number
    start(panelId: string, text: string, caret: number): Promise<void>
    stop(): Promise<void>
    handle(panelId: string, event: DictationEvent): void
  }>>
  export function subscribeDictationEvents(): void
  ```

- [ ] **Step 1: Teste falhando da lógica pura**

`test/renderer/dictation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyDictation, beginDictation } from '@renderer/agent/dictation'

describe('dictation text', () => {
  it('inserts at the caret with a separating space and keeps the suffix', () => {
    const s = beginDictation('olha: fim', 5)
    expect(applyDictation(s, 'abre o arquivo', '')).toEqual({ text: 'olha: abre o arquivo fim', caret: 20 })
  })

  it('no extra space when the prefix is empty or already ends in whitespace', () => {
    expect(applyDictation(beginDictation('', 0), 'oi', '')).toEqual({ text: 'oi', caret: 2 })
    expect(applyDictation(beginDictation('a\n', 2), 'oi', '')).toEqual({ text: 'a\noi', caret: 4 })
    expect(applyDictation(beginDictation('a ', 2), 'oi', '')).toEqual({ text: 'a oi', caret: 4 })
  })

  it('shows volatile text after final text', () => {
    const s = beginDictation('', 0)
    expect(applyDictation(s, 'abre o', ' arquivo').text).toBe('abre o arquivo')
    expect(applyDictation(s, '', 'abre').text).toBe('abre')
  })

  it('does not add a space before a suffix that already starts with whitespace', () => {
    const s = beginDictation('x y', 1)
    expect(applyDictation(s, 'oi', '')).toEqual({ text: 'x oi y', caret: 4 })
  })

  it('saying nothing restores the original text and caret exactly', () => {
    const s = beginDictation('olha', 4)
    expect(applyDictation(s, '', '')).toEqual({ text: 'olha', caret: 4 })
    expect(applyDictation(s, '', '   ')).toEqual({ text: 'olha', caret: 4 })
  })

  it('clamps an out-of-range caret', () => {
    expect(beginDictation('ab', 99).suffix).toBe('')
    expect(beginDictation('ab', -1).prefix).toBe('')
  })
})
```

Run: `npx vitest run test/renderer/dictation.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar a lógica pura**

`src/renderer/src/agent/dictation.ts`:

```ts
/** Where dictated text goes: the draft split at the caret when recording started. */
export type DictationSnapshot = { original: string; originalCaret: number; prefix: string; suffix: string }

export function beginDictation(text: string, caret: number): DictationSnapshot {
  const at = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, at)
  const prefix = before === '' || /\s$/.test(before) ? before : `${before} `
  return { original: text, originalCaret: at, prefix, suffix: text.slice(at) }
}

/** The draft with the transcript spliced in; nothing said yet → the untouched original. */
export function applyDictation(s: DictationSnapshot, final: string, volatile: string): { text: string; caret: number } {
  const spoken = `${final}${volatile}`.trim()
  if (!spoken) return { text: s.original, caret: s.originalCaret }
  const gap = s.suffix !== '' && !/^\s/.test(s.suffix) ? ' ' : ''
  const caret = s.prefix.length + spoken.length
  return { text: `${s.prefix}${spoken}${gap}${s.suffix}`, caret }
}
```

Run: `npx vitest run test/renderer/dictation.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste falhando do store**

`test/renderer/dictationStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.stubGlobal('window', { api: { invoke, on: vi.fn(() => () => undefined) } })

const { useDictation, STOP_TIMEOUT_MS } = await import('@renderer/stores/dictationStore')
const { useAgents } = await import('@renderer/stores/agentStore')

const reset = () => useDictation.setState({ active: null, stopping: false, status: null, snapshot: null, caret: 0 })

describe('dictationStore', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ ok: true, value: null })
    reset()
    useAgents.setState({ chats: {}, drafts: {}, notices: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('start records the panel and applies transcripts to its draft at the caret', async () => {
    useAgents.getState().setDraft('p1', 'olha:')
    await useDictation.getState().start('p1', 'olha:', 5)
    expect(invoke).toHaveBeenCalledWith('dictation:start', 'p1')
    expect(useDictation.getState().active).toBe('p1')
    useDictation.getState().handle('p1', { type: 'transcript', final: 'abre', volatile: ' o' })
    expect(useAgents.getState().drafts['p1']).toBe('olha: abre o')
    expect(useDictation.getState().caret).toBe(12)
  })

  it('ignores events for panels that are not recording', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p2', { type: 'transcript', final: 'x', volatile: '' })
    expect(useAgents.getState().drafts['p2']).toBeUndefined()
  })

  it('a failed start shows a notice and leaves recording mode', async () => {
    invoke.mockResolvedValue({ ok: false, message: 'Helper de ditado não encontrado' })
    await useDictation.getState().start('p1', '', 0)
    expect(useDictation.getState().active).toBeNull()
    expect(useAgents.getState().notices['p1']).toEqual({ text: 'Helper de ditado não encontrado', command: '' })
  })

  it('a rejected invoke also shows a notice', async () => {
    invoke.mockRejectedValue(new Error('ipc down'))
    await useDictation.getState().start('p1', '', 0)
    expect(useDictation.getState().active).toBeNull()
    expect(useAgents.getState().notices['p1']?.text).toContain('ipc down')
  })

  it('status shows until ready; error becomes a notice', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p1', { type: 'status', text: 'baixando modelo de fala…' })
    expect(useDictation.getState().status).toBe('baixando modelo de fala…')
    useDictation.getState().handle('p1', { type: 'ready' })
    expect(useDictation.getState().status).toBeNull()
    useDictation.getState().handle('p1', { type: 'error', message: 'Permissão negada' })
    expect(useAgents.getState().notices['p1']).toEqual({ text: 'Permissão negada', command: '' })
  })

  it('stop asks main to stop and resolves once ended arrives', async () => {
    await useDictation.getState().start('p1', '', 0)
    const done = useDictation.getState().stop()
    expect(useDictation.getState().stopping).toBe(true)
    expect(invoke).toHaveBeenCalledWith('dictation:stop', 'p1')
    useDictation.getState().handle('p1', { type: 'transcript', final: 'fim', volatile: '' })
    useDictation.getState().handle('p1', { type: 'ended' })
    await done
    expect(useDictation.getState()).toMatchObject({ active: null, stopping: false, snapshot: null })
    expect(useAgents.getState().drafts['p1']).toBe('fim')
  })

  it('stop gives up waiting after the timeout so the UI never stays stuck', async () => {
    vi.useFakeTimers()
    await useDictation.getState().start('p1', '', 0)
    const done = useDictation.getState().stop()
    vi.advanceTimersByTime(STOP_TIMEOUT_MS)
    await done
    expect(useDictation.getState().active).toBeNull()
  })

  it('ended without stop (helper crashed) leaves recording mode', async () => {
    await useDictation.getState().start('p1', '', 0)
    useDictation.getState().handle('p1', { type: 'ended' })
    expect(useDictation.getState().active).toBeNull()
  })

  it('starting on another panel stops the first one first', async () => {
    await useDictation.getState().start('p1', '', 0)
    const second = useDictation.getState().start('p2', '', 0)
    useDictation.getState().handle('p1', { type: 'ended' })
    await second
    expect(invoke.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ['dictation:start', 'p1'],
      ['dictation:stop', 'p1'],
      ['dictation:start', 'p2'],
    ])
    expect(useDictation.getState().active).toBe('p2')
  })

  it('start on the panel already recording is a no-op', async () => {
    await useDictation.getState().start('p1', '', 0)
    await useDictation.getState().start('p1', '', 0)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stop with nothing recording resolves immediately', async () => {
    await useDictation.getState().stop()
    expect(invoke).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run test/renderer/dictationStore.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar o store**

`src/renderer/src/stores/dictationStore.ts`:

```ts
import { create } from 'zustand'
import type { DictationEvent } from '@shared/dictation'
import { applyDictation, beginDictation, type DictationSnapshot } from '../agent/dictation'
import { useAgents } from './agentStore'

/** How long `stop()` waits for the helper's `ended` before unlocking the composer anyway. */
export const STOP_TIMEOUT_MS = 3000

type DictationState = {
  /** Panel recording (or finishing) right now; one at a time app-wide. */
  active: string | null
  stopping: boolean
  /** Helper status line (e.g. model download), cleared on `ready`. */
  status: string | null
  snapshot: DictationSnapshot | null
  /** Caret right after the dictated text, for the composer to restore on stop. */
  caret: number
  start(panelId: string, text: string, caret: number): Promise<void>
  stop(): Promise<void>
  handle(panelId: string, event: DictationEvent): void
}

let waiters: Array<() => void> = []
const idle = { active: null, stopping: false, status: null, snapshot: null } as const

const notice = (panelId: string, text: string) => useAgents.getState().setNotice(panelId, { text, command: '' })

export const useDictation = create<DictationState>()((set, get) => ({
  ...idle,
  caret: 0,
  start: async (panelId, text, caret) => {
    const { active } = get()
    if (active === panelId) return
    if (active) await get().stop()
    const snapshot = beginDictation(text, caret)
    set({ active: panelId, stopping: false, status: null, snapshot, caret: snapshot.originalCaret })
    try {
      const res = await window.api.invoke('dictation:start', panelId)
      if (!res.ok) {
        notice(panelId, res.message)
        if (get().active === panelId) set(idle)
      }
    } catch (err) {
      notice(panelId, `Falha ao iniciar o ditado: ${err instanceof Error ? err.message : String(err)}`)
      if (get().active === panelId) set(idle)
    }
  },
  stop: async () => {
    const { active } = get()
    if (!active) return
    set({ stopping: true })
    const ended = new Promise<void>((resolve) => {
      waiters.push(resolve)
      setTimeout(resolve, STOP_TIMEOUT_MS)
    })
    void window.api.invoke('dictation:stop', active).catch((err) => console.error('[next-ide] dictation stop failed', err))
    await ended
    if (get().active === active) set(idle)
  },
  handle: (panelId, event) => {
    const s = get()
    if (s.active !== panelId) return
    switch (event.type) {
      case 'ready':
        set({ status: null })
        return
      case 'status':
        set({ status: event.text })
        return
      case 'transcript': {
        if (!s.snapshot) return
        const next = applyDictation(s.snapshot, event.final, event.volatile)
        useAgents.getState().setDraft(panelId, next.text)
        set({ caret: next.caret })
        return
      }
      case 'error':
        notice(panelId, event.message)
        return
      case 'ended': {
        set(idle)
        const pending = waiters
        waiters = []
        for (const resolve of pending) resolve()
        return
      }
    }
  },
}))

let subscribed = false
export function subscribeDictationEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('dictation:event', (panelId, event) => useDictation.getState().handle(panelId, event))
}
```

Run: `npx vitest run test/renderer/dictationStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Assinar no App**

`src/renderer/src/App.tsx`:
- import: `import { subscribeDictationEvents } from './stores/dictationStore'`
- logo abaixo de `useEffect(() => subscribeAgentEvents(), [])`: `useEffect(() => subscribeDictationEvents(), [])`

Run: `npm run typecheck && npx vitest run`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/agent/dictation.ts src/renderer/src/stores/dictationStore.ts src/renderer/src/App.tsx test/renderer/dictation.test.ts test/renderer/dictationStore.test.ts
git commit -m "feat: dictation store splices live transcripts into the panel draft"
```

---

### Task 5: Botão 🎤 no Composer + e2e

**Files:**
- Modify: `src/renderer/src/panels/agent/Composer.tsx`
- Test: `e2e/dictation.spec.ts`

**Interfaces:**
- Consumes: `useDictation` (`active`, `stopping`, `status`, `caret`, `start`, `stop`) da Task 4; fake `NEXT_IDE_E2E_FAKE_DICTATION=ok|error` da Task 3 (emite `abre o` → `abre o arquivo`; no SIGTERM, `abre o arquivo de config`; `error` → "Permissão de microfone negada.").

- [ ] **Step 1: E2E falhando**

`e2e/dictation.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('ditado escreve no cursor ao vivo, para no clique e não envia sozinho', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('olha:')

  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(input).toHaveValue('olha: abre o arquivo')
  await expect(input).toHaveJSProperty('readOnly', true)

  await page.getByRole('button', { name: 'Parar ditado' }).click()
  await expect(input).toHaveValue('olha: abre o arquivo de config')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await expect(input).toHaveJSProperty('readOnly', false)
  await expect(page.getByTestId('user-bubble')).toHaveCount(0)

  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: olha: abre o arquivo de config')
  await expect(input).toHaveValue('')
  await app.close()
})

test('Enter com o ditado ligado para, espera o texto final e envia', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(input).toHaveValue('abre o arquivo')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: abre o arquivo de config')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await app.close()
})

test('erro do helper vira aviso e o composer volta ao normal', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'error' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('antes')
  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(page.getByTestId('composer-notice')).toContainText('Permissão de microfone negada.')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await expect(input).toHaveValue('antes')
  await expect(input).toHaveJSProperty('readOnly', false)
  await app.close()
})
```

Run: `npx electron-vite build && npx playwright test e2e/dictation.spec.ts`
Expected: FAIL (botão "Ditado" não existe).

- [ ] **Step 2: Implementar no Composer**

`src/renderer/src/panels/agent/Composer.tsx`:

1. Import, junto dos stores: `import { useDictation } from '../../stores/dictationStore'`

2. Constante de módulo, logo depois dos imports:
   ```ts
   const IS_MAC = /Mac/.test(navigator.userAgent)
   ```

3. Dentro do componente, depois de `const fileInput = useRef<HTMLInputElement>(null)`:
   ```ts
   const dictating = useDictation((s) => s.active === panelId)
   const dictationStopping = useDictation((s) => s.active === panelId && s.stopping)
   const dictationStatus = useDictation((s) => (s.active === panelId ? s.status : null))
   const wasDictating = useRef(false)
   // Recording just ended here: hand the textarea back with the caret right after the dictated text.
   useEffect(() => {
     if (wasDictating.current && !dictating) {
       const el = textarea.current
       const caret = useDictation.getState().caret
       el?.focus()
       el?.setSelectionRange(caret, caret)
       setCaret(caret)
     }
     wasDictating.current = dictating
   }, [dictating])
   const toggleDictation = () => {
     if (dictating) void useDictation.getState().stop()
     else void useDictation.getState().start(panelId, text, textarea.current?.selectionStart ?? text.length)
   }
   ```

4. Em `submit`, trocar a primeira parte:
   ```ts
   const submit = () => {
     if (blocked) return
     const value = text.trim()
   ```
   por:
   ```ts
   const submit = () => {
     if (blocked) return
     // Enter while recording: stop, wait for the final transcript, then send what landed in the draft.
     if (useDictation.getState().active === panelId) {
       void useDictation.getState().stop().then(() => submitRef.current())
       return
     }
     // Read the store, not the render closure: after a dictation stop the draft changed since this render.
     const value = (useAgents.getState().drafts[panelId] ?? '').trim()
   ```
   e logo depois do fechamento de `submit` (antes de `const interrupt = …`):
   ```ts
   const submitRef = useRef(submit)
   submitRef.current = submit
   ```

5. No `<textarea>`:
   - acrescentar `readOnly={dictating}`
   - trocar o `placeholder` por:
     ```tsx
     placeholder={dictating ? 'Ouvindo… (clique 🎤 para parar)' : 'Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)'}
     ```
   - no começo do `onKeyDown`, antes de `if (mentionItems.length > 0 && mention) {`:
     ```tsx
          if (dictating) {
            // Read-only while recording: Enter stops and sends, Esc just stops, everything else waits.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              void useDictation.getState().stop()
            }
            return
          }
     ```

6. Na toolbar, logo depois do `<input ref={fileInput} … />`:
   ```tsx
        {IS_MAC && (
          <button
            aria-label={dictating ? 'Parar ditado' : 'Ditado'}
            aria-pressed={dictating}
            title={dictating ? 'Parar ditado' : 'Ditado por voz'}
            className={`rounded px-1 ${dictating ? 'animate-pulse bg-red-600 text-white' : 'hover:bg-neutral-800'} disabled:opacity-40`}
            disabled={dictationStopping}
            onClick={toggleDictation}
          >
            🎤
          </button>
        )}
        {dictationStatus && <span data-testid="dictation-status">{dictationStatus}</span>}
   ```

- [ ] **Step 3: Rodar e2e**

Run: `npx electron-vite build && npx playwright test e2e/dictation.spec.ts`
Expected: 3 passed.

- [ ] **Step 4: Suíte completa**

Run: `npm run typecheck && npx vitest run && npm run test:e2e`
Expected: typecheck limpo; vitest todo verde; e2e todo verde (o `packaged.spec.ts` continua skip se não houver build empacotado).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/agent/Composer.tsx e2e/dictation.spec.ts
git commit -m "feat: mic button in the composer dictates into the draft (never auto-sends)"
```

---

### Task 6: Smoke real (dev + empacotado) — usuário

**Files:** nenhum (só verificação; ajustes que surgirem viram commits `fix:`).

- [ ] **Step 1: Dev**

Run: `npm run dev`. Abrir um painel do Claude, clicar 🎤, aceitar o prompt de microfone do "next-ide", falar uma frase em português, clicar 🎤 de novo.
Expected: texto aparece ao vivo no campo; ao parar fica o texto final; nada é enviado; Enter envia.
Se o macOS não mostrar prompt e o helper emitir erro de permissão mesmo com as chaves no Info.plist do Electron.app de dev (`npm run brand` rodado): aplicar o fallback da spec §4 — empacotar o helper como `.app` mínimo com Info.plist próprio — como uma tarefa nova, depois de confirmar com o usuário.

- [ ] **Step 2: Empacotado**

Run: `npm run package && npm run app`. Repetir o Step 1 no app empacotado.
Expected: igual ao dev; `ls dist/mac-arm64/next-ide.app/Contents/Resources/bin/next-ide-dictation` existe; `npx playwright test e2e/packaged.spec.ts` passa.

- [ ] **Step 3: Negar permissão**

Em Ajustes do Sistema > Privacidade e Segurança > Microfone, desligar o next-ide; clicar 🎤.
Expected: `composer-notice` com "Permissão de microfone negada…"; composer destrava.
