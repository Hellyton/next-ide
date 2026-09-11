import { memo } from 'react'
import type { ChatItem } from '../../../agent/chatReducer'
import { sameItems } from '../../../agent/chatTree'
import { ErrorCard } from './ErrorCard'
import { PermissionCard } from './PermissionCard'
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

type Props = {
  item: ChatItem
  /** For task tools: every nested item of the task's subtree (see descendantsByTask). */
  descendants?: ChatItem[] | undefined
  panelId: string
}

function ChatItemViewImpl({ item, descendants, panelId }: Props) {
  switch (item.type) {
    case 'user':
      return <UserBubble text={item.text} images={item.images} />
    case 'text':
      return <TextBlock text={item.text} streaming={!item.final} />
    case 'thinking':
      return <ThinkingBlock text={item.text} />
    case 'tool':
      return <ToolCard item={item} descendants={descendants} panelId={panelId} />
    case 'error':
      return <ErrorCard message={item.message} />
    case 'permission':
      return <PermissionCard item={item} panelId={panelId} />
  }
}

/** The reducer keeps unchanged items by identity, so only the item being updated re-renders. */
export const ChatItemView = memo(
  ChatItemViewImpl,
  (prev, next) => prev.item === next.item && prev.panelId === next.panelId && sameItems(prev.descendants, next.descendants),
)
