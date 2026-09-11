import { useEffect, useRef } from 'react'
import type { ChatItem } from '../../agent/chatReducer'
import { ChatItemView, itemKey } from './cards/ChatItemView'

const isChild = (item: ChatItem) => (item.type === 'text' || item.type === 'tool') && Boolean(item.parentToolUseId)

export function ChatView({ items, panelId }: { items: ChatItem[]; panelId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [items])

  const topLevel = items.filter((item) => !isChild(item))

  return (
    <div
      ref={ref}
      data-testid="chat-view"
      className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      onScroll={() => {
        const el = ref.current
        if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
    >
      {topLevel.length === 0 && <div className="pt-10 text-center text-sm text-neutral-600">Pergunte algo ao Claude sobre este projeto.</div>}
      {topLevel.map((item) => (
        <ChatItemView key={itemKey(item)} item={item} items={items} panelId={panelId} />
      ))}
    </div>
  )
}
