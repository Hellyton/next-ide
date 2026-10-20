import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ImageAttachment, ModelOption } from '@shared/agent'
import { agentMentionItems, applyMention, mentionItems as computeMentionItems, mentionQuery } from '../../agent/mentions'
import type { ChatState } from '../../agent/chatReducer'
import { composerKeyAction, isBackgroundKey, isDoubleEscape } from '../../agent/composerKeys'
import { fileMention, insertMentions, splitFiles } from '../../agent/attachments'
import { canSend, readImage, validateImage } from '../../agent/images'
import { argItems, argQuery, classifySlash, filterCommands, mergeCommands, slashQuery, type LocalCommand, type SlashItem } from '../../agent/slash'
import { useDock } from '../../dock/dockStore'
import { useAgents } from '../../stores/agentStore'
import { useDictation } from '../../stores/dictationStore'
import { useFiles } from '../../stores/filesStore'
import { AttachIcon, HistoryIcon, MicIcon, StopIcon } from './icons'
import { MentionMenu } from './MentionMenu'
import { ModeIndicator } from './ModeIndicator'
import { SlashMenu } from './SlashMenu'

const IS_MAC = /Mac/.test(navigator.userAgent)
const ICON_BUTTON =
  'flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 ring-1 ring-neutral-800 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40'

type Props = {
  panelId: string
  chat: ChatState
  projectPath: string
  onSend(text: string, images: ImageAttachment[]): void
  onLocalCommand(name: LocalCommand, arg: string): void
  onBtw(question: string): void
  /** Closes an open /btw answer; returns false when none is open. */
  onEscape(): boolean
  onRewind(): void
  /** Ctrl+B: moves the running turn's foreground Bash commands/subagents to the background. */
  onBackground(): void
  /** Shift+Tab: next permission mode, like the CLI. */
  onCycleMode(): void
  /** A rewind/rename is in flight: typing stays possible, sending (and slash commands) waits. */
  blocked?: boolean
}

export function Composer({ panelId, chat, projectPath, onSend, onLocalCommand, onBtw, onEscape, onRewind, onBackground, onCycleMode, blocked = false }: Props) {
  const text = useAgents((s) => s.drafts[panelId] ?? '')
  const setText = (value: string) => useAgents.getState().setDraft(panelId, value)
  const [caret, setCaret] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const history = useRef<string[]>([])
  const lastEsc = useRef<number | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const busy = chat.state === 'running' || chat.state === 'awaiting_permission'
  const [commands, setCommands] = useState<SlashItem[] | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const notice = useAgents((s) => s.notices[panelId] ?? null)
  const setNotice = (value: { text: string; command: string } | null) => useAgents.getState().setNotice(panelId, value)
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [reading, setReading] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const dictating = useDictation((s) => s.active === panelId)
  const dictationStopping = useDictation((s) => s.active === panelId && s.stopping)
  const dictationStatus = useDictation((s) => (s.active === panelId ? s.status : null))
  const wasDictating = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  // Recording just ended here: hand the textarea back with the caret right after the dictated text —
  // unless focus already moved elsewhere (e.g. the user started dictating in another panel).
  useEffect(() => {
    const focused = document.activeElement
    const focusIsOurs = !focused || focused === document.body || Boolean(root.current?.contains(focused))
    if (wasDictating.current && !dictating && focusIsOurs) {
      const el = textarea.current
      const caret = useDictation.getState().caret
      el?.focus()
      el?.setSelectionRange(caret, caret)
      setCaret(caret)
    }
    wasDictating.current = dictating
  }, [dictating])
  const toggleDictation = () => {
    if (dictating) {
      void useDictation.getState().stop()
      return
    }
    void useDictation.getState().start(panelId, text, textarea.current?.selectionStart ?? text.length)
    // Keep keyboard focus in the field, so Enter means "stop and send" rather than re-clicking the button.
    textarea.current?.focus()
  }
  const query = slashQuery(text)
  const arg = query === null ? argQuery(text) : null
  const [models, setModels] = useState<ModelOption[] | null>(null)
  const menuItems =
    query !== null
      ? filterCommands(commands ?? mergeCommands([], chat.slashCommands), query)
      : arg
        ? argItems(arg.command, arg.query, models ?? [])
        : []
  const mention = query === null && !arg ? mentionQuery(text, caret) : null
  const index = useFiles((s) => s.indexes[projectPath])
  const [agentNames, setAgentNames] = useState<string[] | undefined>(undefined)
  const mentionItems = useMemo(
    () => [...agentMentionItems(mention, dismissedAt, agentNames), ...computeMentionItems(mention, dismissedAt, index)].slice(0, 8),
    [mention?.query, mention?.start, dismissedAt, agentNames, index],
  )
  const activeIndex = (n: number) => Math.min(menuIndex, Math.max(n - 1, 0))

  useEffect(() => {
    if (mention) void useFiles.getState().ensureIndex(projectPath)
  }, [mention !== null, projectPath])

  useEffect(() => {
    if (!mention || agentNames !== undefined) return
    window.api
      .invoke('agent:agents', panelId)
      .then((r) => setAgentNames(r.ok ? r.value.map((a) => a.name) : []))
      .catch(() => setAgentNames([]))
  }, [mention !== null, agentNames, panelId])

  const pickMention = (rel: string) => {
    if (!mention) return
    const next = applyMention(text, mention.start, caret, rel)
    setText(next.text)
    setCaret(next.caret)
    setMenuIndex(0)
    requestAnimationFrame(() => textarea.current?.setSelectionRange(next.caret, next.caret))
  }

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`
  }, [text])

  useEffect(() => {
    if (query === null || commands) return
    window.api
      .invoke('agent:commands', panelId)
      .then((sdk) => setCommands(mergeCommands(sdk, chat.slashCommands)))
      .catch(() => setCommands(mergeCommands([], chat.slashCommands)))
  }, [query === null, commands, panelId, chat.slashCommands])

  useEffect(() => {
    if (arg?.command !== 'model' || models) return
    window.api
      .invoke('agent:models', panelId)
      .then(setModels)
      .catch(() => setModels([]))
  }, [arg?.command, models, panelId])

  const pick = (item: SlashItem) => {
    setText(`/${item.name} `)
    setMenuIndex(0)
  }
  /** An argument (e.g. "/mode plan") runs right away; a command name just fills the input. */
  const choose = (item: SlashItem) => {
    if (!arg) return pick(item)
    setText(`/${item.name}`)
    setMenuIndex(0)
    submit()
  }

  const addFiles = (files: File[]) => {
    const errors: string[] = []
    const valid = files.filter((f) => {
      const error = validateImage(f)
      if (error) errors.push(error)
      return !error
    })
    if (errors.length) setNotice({ text: errors.join(' · '), command: '' })
    if (valid.length === 0) return
    setReading((n) => n + valid.length)
    void Promise.all(valid.map(readImage))
      .then((read) => setImages((prev) => [...prev, ...read]))
      .catch((err) => setNotice({ text: String(err), command: '' }))
      .finally(() => setReading((n) => n - valid.length))
  }

  /** Any dropped/picked/pasted file: images inline, the rest as @path for the agent to read. */
  const addAny = (files: File[]) => {
    if (files.length === 0) return
    const { images: inline, others } = splitFiles(files)
    if (inline.length) addFiles(inline)
    if (others.length === 0) return
    if (useDictation.getState().active === panelId) return setNotice({ text: 'Pare o ditado antes de anexar arquivos.', command: '' })
    const missing: string[] = []
    let unsafe = 0
    const mentions = others.flatMap((f) => {
      const path = window.api.pathForFile(f)
      if (!path) missing.push(f.name)
      const mention = path ? fileMention(projectPath, path) : null
      if (path && !mention) unsafe++
      return mention ? [mention] : []
    })
    if (missing.length) setNotice({ text: `${missing.join(', ')}: arquivo sem caminho no disco; salve-o e arraste de novo.`, command: '' })
    // The name itself is not echoed: it is the part that can't be trusted.
    else if (unsafe) setNotice({ text: 'Arquivo com aspas ou quebra de linha no nome não pode ser anexado; renomeie-o e arraste de novo.', command: '' })
    if (mentions.length === 0) return
    const current = useAgents.getState().drafts[panelId] ?? ''
    const next = insertMentions(current, textarea.current?.selectionStart ?? current.length, mentions)
    setText(next.text)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(next.caret, next.caret)
    })
  }
  const addAnyRef = useRef(addAny)
  addAnyRef.current = addAny

  // Files dropped anywhere on the chat panel. Native capture listeners on the panel: dockview's
  // own drag handling would otherwise see (and swallow) the drag before React's handlers.
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const panel = root.current?.parentElement
    if (!panel) return
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.stopPropagation()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      setDragging(false)
      addAnyRef.current(Array.from(e.dataTransfer?.files ?? []))
    }
    const listeners = [['dragenter', enter], ['dragover', over], ['dragleave', leave], ['drop', drop]] as const
    for (const [type, fn] of listeners) panel.addEventListener(type, fn, true)
    return () => {
      for (const [type, fn] of listeners) panel.removeEventListener(type, fn, true)
    }
  }, [])

  const submit = () => {
    if (blocked) return
    // Enter while recording: stop, wait for the final transcript, then send what landed in the draft.
    if (useDictation.getState().active === panelId) {
      void useDictation.getState().stop().then(() => submitRef.current())
      return
    }
    // Read the store, not the render closure: after a dictation stop the draft changed since this render.
    const value = (useAgents.getState().drafts[panelId] ?? '').trim()
    if (!canSend({ text: value, images: images.length, reading })) return
    setNotice(null)
    if (images.length === 0) {
      const action = classifySlash(value)
      if (action.kind === 'local') {
        setText('')
        onLocalCommand(action.name, action.arg)
        return
      }
      if (action.kind === 'btw') {
        if (!action.question) {
          setNotice({ text: 'Uso: /btw <pergunta>', command: '' })
          return
        }
        onBtw(action.question)
        history.current.push(value)
        setText('')
        return
      }
      if (action.kind === 'tui') {
        setNotice({ text: `/${action.name} só funciona no terminal do Claude Code.`, command: `claude /${action.name}` })
        return
      }
    }
    onSend(value, images)
    if (value) history.current.push(value)
    setText('')
    setImages([])
  }
  const submitRef = useRef(submit)
  submitRef.current = submit
  const interrupt = () => void window.api.invoke('agent:interrupt', panelId).catch((err) => console.error('[next-ide] interrupt failed', err))

  return (
    <div
      ref={root}
      className="border-t border-neutral-800 p-2"
    >
      {dragging && (
        // Positioned against the agent panel (the nearest `relative` ancestor), so it covers the whole chat.
        <div
          data-testid="drop-overlay"
          className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-orange-500/70 bg-neutral-950/85 text-sm text-neutral-200"
        >
          <AttachIcon className="h-6 w-6 text-orange-400" />
          <span>Solte para anexar</span>
          <span className="text-xs text-neutral-500">imagens, PDF, planilhas, CSV e qualquer arquivo</span>
        </div>
      )}
      <SlashMenu items={menuItems} activeIndex={Math.min(menuIndex, Math.max(menuItems.length - 1, 0))} onPick={choose} />
      <MentionMenu items={mentionItems} activeIndex={activeIndex(mentionItems.length)} onPick={pickMention} />
      {notice && (
        <div data-testid="composer-notice" className="mb-1 flex items-center gap-2 rounded border border-amber-800 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
          <span className="flex-1">{notice.text}</span>
          {notice.command && (
            <button
              className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-100 hover:bg-neutral-700"
              onClick={() => {
                useDock.getState().open({ type: 'terminal', projectPath, initialCommand: notice.command })
                setNotice(null)
              }}
            >
              Abrir em terminal
            </button>
          )}
        </div>
      )}
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
      <textarea
        ref={textarea}
        data-composer={panelId}
        aria-label="Mensagem para o Claude"
        placeholder={dictating ? 'Ouvindo… (clique 🎤 para parar)' : 'Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)'}
        readOnly={dictating}
        rows={1}
        className="w-full resize-none rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart ?? e.target.value.length)
          setDismissedAt(null)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.length) {
            e.preventDefault()
            addAny(files)
          }
        }}
        onKeyDown={(e) => {
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
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault()
            onCycleMode()
            return
          }
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
                choose(chosen)
                return
              }
            }
          }
          if (e.key === 'Escape' && onEscape()) {
            e.preventDefault()
            return
          }
          if (isBackgroundKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey })) {
            if (busy) {
              e.preventDefault()
              onBackground()
            }
            return
          }
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
        <button
          aria-label="Anexar arquivo"
          title="Anexar arquivo (ou arraste para o chat)"
          className={ICON_BUTTON}
          onClick={() => fileInput.current?.click()}
        >
          <AttachIcon className="h-4 w-4" />
        </button>
        <button aria-label="Histórico de conversas" title="Histórico de conversas (/resume)" className={ICON_BUTTON} onClick={() => onLocalCommand('resume', '')}>
          <HistoryIcon className="h-4 w-4" />
        </button>
        <input
          ref={fileInput}
          data-testid="image-input"
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addAny(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        {IS_MAC && (
          <button
            aria-label={dictating ? 'Parar ditado' : 'Ditado'}
            aria-pressed={dictating}
            title={dictating ? 'Parar ditado' : 'Ditado por voz'}
            className={
              dictating
                ? 'relative flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-white shadow-[0_0_0_3px_rgba(220,38,38,0.25)] transition hover:bg-red-500 disabled:opacity-40'
                : ICON_BUTTON
            }
            disabled={dictationStopping}
            onClick={toggleDictation}
          >
            {dictating && <span className="absolute inset-0 animate-ping rounded-md bg-red-500/40" />}
            {dictating ? <StopIcon className="relative h-3.5 w-3.5" /> : <MicIcon className="h-4 w-4" />}
          </button>
        )}
        {dictationStatus && <span data-testid="dictation-status">{dictationStatus}</span>}
        {reading > 0 && <span data-testid="image-reading-hint">carregando imagem…</span>}
        <ModeIndicator mode={chat.permissionMode} onCycle={onCycleMode} />
        <span className="flex-1" />
        {busy ? (
          <button aria-label="Parar" className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700" onClick={interrupt}>
            ■
          </button>
        ) : (
          <button
            aria-label="Enviar"
            className="rounded bg-orange-600 px-2 py-1 text-white hover:bg-orange-500 disabled:opacity-40"
            disabled={blocked || !canSend({ text, images: images.length, reading })}
            onClick={submit}
          >
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
