import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ImageAttachment } from '@shared/agent'
import type { ChatState } from '../../agent/chatReducer'
import { composerKeyAction } from '../../agent/composerKeys'
import { classifySlash, filterCommands, mergeCommands, slashQuery, type LocalCommand, type SlashItem } from '../../agent/slash'
import { useDock } from '../../dock/dockStore'
import { ModelSelect } from './ModelSelect'
import { ModeSelect } from './ModeSelect'
import { SlashMenu } from './SlashMenu'

type Props = {
  panelId: string
  chat: ChatState
  projectPath: string
  onSend(text: string, images: ImageAttachment[]): void
  onLocalCommand(name: LocalCommand): void
}

export function Composer({ panelId, chat, projectPath, onSend, onLocalCommand }: Props) {
  const [text, setText] = useState('')
  const history = useRef<string[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)
  const busy = chat.state === 'running' || chat.state === 'awaiting_permission'
  const [commands, setCommands] = useState<SlashItem[] | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [notice, setNotice] = useState<{ text: string; command: string } | null>(null)
  const query = slashQuery(text)
  const menuItems = query === null ? [] : filterCommands(commands ?? mergeCommands([], chat.slashCommands), query)

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

  const submit = () => {
    const value = text.trim()
    if (!value) return
    const action = classifySlash(value)
    setNotice(null)
    if (action.kind === 'local') {
      setText('')
      onLocalCommand(action.name)
      return
    }
    if (action.kind === 'tui') {
      setNotice({ text: `/${action.name} só funciona no terminal do Claude Code.`, command: `claude /${action.name}` })
      return
    }
    onSend(value, [])
    history.current.push(value)
    setText('')
  }
  const interrupt = () => void window.api.invoke('agent:interrupt', panelId).catch((err) => console.error('[next-ide] interrupt failed', err))

  return (
    <div className="border-t border-neutral-800 p-2">
      <SlashMenu items={menuItems} activeIndex={Math.min(menuIndex, Math.max(menuItems.length - 1, 0))} onPick={pick} />
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
      <textarea
        ref={textarea}
        aria-label="Mensagem para o Claude"
        placeholder="Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)"
        rows={1}
        className="w-full resize-none rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
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
        <ModelSelect panelId={panelId} model={chat.model} />
        <ModeSelect panelId={panelId} mode={chat.permissionMode} />
        <span className="flex-1" />
        {busy ? (
          <button aria-label="Parar" className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700" onClick={interrupt}>
            ■
          </button>
        ) : (
          <button aria-label="Enviar" className="rounded bg-orange-600 px-2 py-1 text-white hover:bg-orange-500 disabled:opacity-40" disabled={!text.trim()} onClick={submit}>
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
