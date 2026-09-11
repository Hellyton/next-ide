import type { ChatItem, ToolItem } from '../../../agent/chatReducer'
import { isTaskTool, parentOf } from '../../../agent/chatTree'
import { ChatItemView, itemKey } from './ChatItemView'
import { ToolStatus } from './GenericToolCard'

export function TaskCard({ item, descendants, panelId }: { item: ToolItem; descendants?: ChatItem[] | undefined; panelId: string }) {
  const children = (descendants ?? []).filter((c) => parentOf(c) === item.id)
  const description = typeof (item.input as { description?: unknown })?.description === 'string' ? (item.input as { description: string }).description : 'Subagente'
  return (
    <details className="rounded border border-violet-900/60 text-xs" data-testid="task-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-violet-300">Subagente</span>
        <span className="truncate text-neutral-400">{description}</span>
        <span className="text-neutral-600">({children.length})</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      <div className="space-y-2 border-t border-violet-900/40 p-2">
        {children.map((child) => (
          <ChatItemView
            key={itemKey(child)}
            item={child}
            // Nested tasks filter their own children out of the same subtree.
            descendants={child.type === 'tool' && isTaskTool(child.name) ? descendants : undefined}
            panelId={panelId}
          />
        ))}
      </div>
    </details>
  )
}
