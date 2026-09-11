import { useLayoutEffect, useRef, useState } from 'react'
import type { ImageAttachment } from '@shared/agent'
import type { ChatState } from '../../agent/chatReducer'
import { composerKeyAction } from '../../agent/composerKeys'

type Props = { panelId: string; chat: ChatState; onSend(text: string, images: ImageAttachment[]): void }

export function Composer({ panelId, chat, onSend }: Props) {
  const [text, setText] = useState('')
  const history = useRef<string[]>([])
  const textarea = useRef<HTMLTextAreaElement>(null)
  const busy = chat.state === 'running' || chat.state === 'awaiting_permission'

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`
  }, [text])

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSend(value, [])
    history.current.push(value)
    setText('')
  }
  const interrupt = () => void window.api.invoke('agent:interrupt', panelId).catch((err) => console.error('[next-ide] interrupt failed', err))

  return (
    <div className="border-t border-neutral-800 p-2">
      <textarea
        ref={textarea}
        aria-label="Mensagem para o Claude"
        placeholder="Pergunte ao Claude… (Enter envia, Shift+Enter quebra linha)"
        rows={1}
        className="w-full resize-none rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 focus:ring-neutral-600"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
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
