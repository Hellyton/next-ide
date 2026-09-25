import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ImageAttachment } from '@shared/agent'
import { applyMention, mentionItems as computeMentionItems, mentionQuery } from '../../agent/mentions'
import type { ChatState } from '../../agent/chatReducer'
import { composerKeyAction, isBackgroundKey, isDoubleEscape } from '../../agent/composerKeys'
import { canSend, pickImageFiles, readImage, validateImage } from '../../agent/images'
import { classifySlash, filterCommands, mergeCommands, slashQuery, type LocalCommand, type SlashItem } from '../../agent/slash'
import { useDock } from '../../dock/dockStore'
import { useAgents } from '../../stores/agentStore'
import { useFiles } from '../../stores/filesStore'
import { EffortSelect } from './EffortSelect'
import { MentionMenu } from './MentionMenu'
import { ModelSelect } from './ModelSelect'
import { ModeSelect } from './ModeSelect'
import { SlashMenu } from './SlashMenu'

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
  /** A rewind/rename is in flight: typing stays possible, sending (and slash commands) waits. */
  blocked?: boolean
}

export function Composer({ panelId, chat, projectPath, onSend, onLocalCommand, onBtw, onEscape, onRewind, onBackground, blocked = false }: Props) {
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
  const query = slashQuery(text)
  const menuItems = query === null ? [] : filterCommands(commands ?? mergeCommands([], chat.slashCommands), query)
  const mention = query === null ? mentionQuery(text, caret) : null
  const index = useFiles((s) => s.indexes[projectPath])
  const mentionItems = useMemo(
    () => computeMentionItems(mention, dismissedAt, index),
    [mention?.query, mention?.start, dismissedAt, index],
  )
  const activeIndex = (n: number) => Math.min(menuIndex, Math.max(n - 1, 0))

  useEffect(() => {
    if (mention) void useFiles.getState().ensureIndex(projectPath)
  }, [mention !== null, projectPath])

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

  const pick = (item: SlashItem) => {
    setText(`/${item.name} `)
    setMenuIndex(0)
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

  const submit = () => {
    if (blocked) return
    const value = text.trim()
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
  const interrupt = () => void window.api.invoke('agent:interrupt', panelId).catch((err) => console.error('[next-ide] interrupt failed', err))

  return (
    <div
      className="border-t border-neutral-800 p-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const files = pickImageFiles(e.dataTransfer.files)
        if (files.length) {
          e.preventDefault()
          addFiles(files)
        }
      }}
    >
      <SlashMenu items={menuItems} activeIndex={Math.min(menuIndex, Math.max(menuItems.length - 1, 0))} onPick={pick} />
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
        placeholder="Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)"
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
          const files = pickImageFiles(e.clipboardData.files)
          if (files.length) {
            e.preventDefault()
            addFiles(files)
          }
        }}
        onKeyDown={(e) => {
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
                pick(chosen)
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
        <button aria-label="Anexar imagem" className="rounded px-1 hover:bg-neutral-800" onClick={() => fileInput.current?.click()}>
          +img
        </button>
        <input
          ref={fileInput}
          data-testid="image-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        {reading > 0 && <span data-testid="image-reading-hint">carregando imagem…</span>}
        <ModelSelect panelId={panelId} model={chat.model} />
        <EffortSelect panelId={panelId} effort={chat.effort} />
        <ModeSelect panelId={panelId} mode={chat.permissionMode} />
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
