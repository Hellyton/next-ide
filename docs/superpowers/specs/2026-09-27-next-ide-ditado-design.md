# next-ide — Ditado por voz no composer — Design

Data: 2026-09-27
Status: abordagem e comportamento aprovados em conversa; aguardando revisão da spec escrita

## 1. Objetivo

Falar em vez de digitar no composer do painel do agente. Um botão 🎤 na toolbar liga/desliga a
gravação; o texto aparece no campo enquanto o usuário fala; o usuário revisa e envia normalmente.

Motor: framework de fala nativo do macOS (`SpeechAnalyzer` + `SpeechTranscriber`, macOS 26+), em
modo local. Sem custo, sem chave de API, áudio não sai da máquina. Verificado na máquina do usuário
(macOS 27, arm64): `SpeechTranscriber` suporta pt-BR e o modelo já está instalado.

### Critérios de sucesso

- Clicar 🎤, falar em português e ver o texto aparecer ao vivo no composer, na posição do cursor.
- Clicar 🎤 de novo para parar; o texto final fica no campo, nada é enviado sozinho.
- Funciona em `npm run dev` e no app empacotado (`npm run package`).
- Permissão negada / sem microfone / helper ausente vira aviso no `composer-notice`, sem travar.
- Suíte (vitest + e2e) verde; e2e usa helper fake, sem microfone real.

### Fora de escopo

- Atalho de teclado / push-to-talk (usuário escolheu só o botão).
- Envio automático, comandos por voz, troca de idioma na UI (locale fixo pt-BR, helper aceita
  `--locale` para o futuro).
- Windows/Linux (botão não aparece fora do macOS).
- Ditado no terminal ou no editor de arquivos.

## 2. Arquitetura

```
Composer 🎤 ──invoke dictation:start(panelId)──▶ DictationManager (main)
                                                   │ spawn resources/bin/next-ide-dictation --locale pt-BR
                                                   ▼
                                         helper Swift: AVAudioEngine → SpeechAnalyzer
                                                   │ stdout: JSON por linha
Composer ◀──event dictation:event(panelId, ev)─────┘
```

### 2.1 Helper Swift (`src/native/dictation/main.swift`)

Binário de linha de comando, um arquivo, sem dependências.

- Checa/pede autorização de microfone (`AVCaptureDevice.requestAccess(for: .audio)`) e, se a API
  exigir, de reconhecimento de fala (`SFSpeechRecognizer.requestAuthorization`). Negado → emite
  `error` e sai com código 1.
- Garante o modelo do locale (`AssetInventory`); se precisar baixar, emite `status` antes.
- `SpeechTranscriber(locale:, reportingOptions: [.volatileResults])` dentro de `SpeechAnalyzer`.
  Áudio do `AVAudioEngine.inputNode` convertido para `SpeechAnalyzer.bestAvailableAudioFormat` e
  entregue via `AsyncStream<AnalyzerInput>`.
- O helper acumula o texto: `final` = soma dos resultados finais, `volatile` = resultado volátil
  atual. A cada resultado emite a transcrição inteira (renderer não precisa acumular nada).
- SIGTERM/SIGINT → para o engine, `finalizeAndFinishThroughEndOfInput()`, emite a última
  transcrição com `volatile` vazio e sai com código 0.

Protocolo stdout (uma linha JSON por evento):

```json
{"type":"ready"}
{"type":"status","text":"baixando modelo de fala…"}
{"type":"transcript","final":"abre o arquivo","volatile":" de config"}
{"type":"error","message":"Permissão de microfone negada"}
```

### 2.2 Main: `DictationManager` (`src/main/dictation/`)

- `start(panelId)`: se outro painel está gravando, para esse primeiro (ele recebe `ended`). Faz
  spawn do helper via `SpawnFn` injetada (padrão do `PtyManager`), lê stdout por linha, faz parse
  com `parseDictationLine` (linha inválida é ignorada e logada) e repassa como `dictation:event`.
  Retorna `Outcome<null>`: helper ausente → `{ ok:false, message:'Helper de ditado não encontrado
  (rode npm run build:dictation)' }`.
- `stop(panelId)`: SIGTERM; se não sair em 3 s, SIGKILL.
- Quando o processo sai, emite `{ type:'ended' }` (com `error` antes se saiu com código ≠ 0 sem ter
  emitido erro).
- `agent:close` do painel e o quit do app param a gravação.
- Caminho do binário: empacotado `process.resourcesPath/bin/next-ide-dictation`; dev
  `<appPath>/resources/bin/next-ide-dictation`.
- `NEXT_IDE_E2E_FAKE_DICTATION=1` troca o spawn por `node test/fixtures/fakeDictation.mjs`, que
  emite uma sequência fixa (ready, parciais, final) e respeita SIGTERM.

### 2.3 Contrato IPC (`src/shared/ipc-contract.ts`, `src/shared/dictation.ts`)

```ts
type DictationEvent =
  | { type: 'ready' }
  | { type: 'status'; text: string }
  | { type: 'transcript'; final: string; volatile: string }
  | { type: 'error'; message: string }
  | { type: 'ended' }

'dictation:start': { args: [panelId: string]; result: Outcome<null> }
'dictation:stop':  { args: [panelId: string]; result: void }
// EventMap
'dictation:event': [panelId: string, event: DictationEvent]
```

### 2.4 Renderer

- `agentStore`: `dictating: string | null` (painel que está gravando) — um por vez no app todo.
- `src/renderer/src/agent/dictation.ts` (puro, testado):
  - `beginDictation(text, caret)` → snapshot `{ prefix, suffix }`; insere espaço separador se o
    prefixo não termina em espaço/quebra de linha e não está vazio.
  - `applyDictation(snapshot, final, volatile)` → `{ text, caret }` = `prefix + final + volatile +
    suffix`, cursor no fim do texto ditado.
- `Composer`:
  - Botão 🎤 na toolbar, ao lado do `+img`, só em macOS. `aria-label` "Ditado" / "Parar ditado".
    Gravando: vermelho pulsando (`animate-pulse`).
  - Clique liga: grava snapshot, chama `dictation:start`; falha → `setNotice`.
  - Enquanto grava, textarea fica `readOnly` (evita conflito entre digitação e texto ao vivo).
    `status` aparece como placeholder/hint pequeno.
  - `transcript` → `setDraft(applyDictation(...))`.
  - `error` → `setNotice({ text: message, command: '' })`.
  - `ended` → sai do modo gravando, devolve foco ao textarea com cursor no fim do ditado.
  - Enviar (Enter/↑) durante a gravação: chama `dictation:stop`, espera `ended` (máx. 3 s) e envia
    o texto final.

## 3. Build e empacotamento

- `scripts/build-dictation.mjs`: `swiftc -O src/native/dictation/main.swift -o
  resources/bin/next-ide-dictation`, pula se o binário é mais novo que o fonte, e só avisa (não
  falha) se `swiftc` não existir ou se não for macOS.
- `package.json`: script `build:dictation`; roda antes de `dev`, `build`, `package` e `dist`.
- `resources/bin/` no `.gitignore`.
- `electron-builder.yml`: `extraResources: [{ from: resources/bin, to: bin }]`;
  `mac.extendInfo` ganha `NSMicrophoneUsageDescription` e `NSSpeechRecognitionUsageDescription`.
  `afterPack` já assina com `--deep` ad hoc.
- `scripts/brand-electron.mjs` (dev): adiciona as mesmas duas chaves no Info.plist do Electron.app
  de dev, antes do re-sign.

## 4. Riscos

- **Permissão (TCC) creditada ao processo certo.** O macOS deve atribuir mic/fala ao app pai
  (next-ide.app / Electron.app de dev), por isso as chaves no Info.plist. Primeira tarefa da
  implementação é um spike: helper mínimo disparado pelo app em dev e empacotado, confirmar o prompt
  e a gravação. Se o TCC não herdar, fallback: empacotar o helper como `.app` mínimo com Info.plist
  próprio.
- **Termos técnicos em inglês** podem sair errados. Aceito; texto fica editável antes de enviar.
- **API nova (macOS 26+).** Helper checa `#available(macOS 26, *)`; abaixo disso emite `error`.

## 5. Testes

- vitest: `parseDictationLine` (válidas, inválidas, campos faltando); `DictationManager` com spawn
  fake (start/stop, troca de painel, saída com erro, helper ausente, SIGKILL após timeout);
  `beginDictation`/`applyDictation` (cursor no meio, prefixo vazio, separador, sufixo preservado).
- e2e (helper fake): clicar 🎤, ver texto parcial e final no textarea, parar, enviar; erro do helper
  vira `composer-notice`.
- Manual (usuário): falar de verdade em dev e no app empacotado; negar permissão e ver o aviso.
