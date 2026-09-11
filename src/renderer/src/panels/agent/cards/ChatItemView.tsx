import type { ChatItem } from '../../../agent/chatReducer'
import { ErrorCard } from './ErrorCard'
import { TextBlock } from './TextBlock'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'
import { UserBubble } from './UserBubble'

export function itemKey(item: ChatItem): string {
  switch (item.type) {
    case 'user':
    case 'error':
    case 'tool':
      return `${item.type}:${item.id}`
    case 'text':
    case 'thinking':
      return `${item.type}:${item.key}`
    case 'permission':
      return `permission:${item.requestId}`
  }
}

export function ChatItemView({ item, items, panelId }: { item: ChatItem; items: ChatItem[]; panelId: string }) {
  switch (item.type) {
    case 'user':
      return <UserBubble text={item.text} images={item.images} />
    case 'text':
      return <TextBlock text={item.text} streaming={!item.final} />
    case 'thinking':
      return <ThinkingBlock text={item.text} />
    case 'tool':
      return <ToolCard item={item} items={items} panelId={panelId} />
    case 'error':
      return <ErrorCard message={item.message} />
    case 'permission':
      return <div className="text-xs text-orange-400">Permissão pendente: {item.toolName}</div>
  }
}
