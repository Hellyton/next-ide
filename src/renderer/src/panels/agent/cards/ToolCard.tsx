import type { ChatItem, ToolItem } from '../../../agent/chatReducer'
import { isQuietTool, toolDiff, toolTodos } from '../../../agent/toolView'
import { BashCard } from './BashCard'
import { DiffCard } from './DiffCard'
import { GenericToolCard } from './GenericToolCard'
import { TaskCard } from './TaskCard'
import { TodoCard } from './TodoCard'

export function ToolCard({ item, items, panelId }: { item: ToolItem; items: ChatItem[]; panelId: string }) {
  if (item.name === 'Task' || item.name === 'Agent') return <TaskCard item={item} items={items} panelId={panelId} />
  if (item.name === 'Bash') return <BashCard item={item} />
  const diff = toolDiff(item.name, item.input)
  if (diff) return <DiffCard item={item} filePath={diff.filePath} lines={diff.lines} />
  const todos = item.name === 'TodoWrite' ? toolTodos(item.input) : null
  if (todos) return <TodoCard todos={todos} />
  if (isQuietTool(item.name)) return <GenericToolCard item={item} />
  return <GenericToolCard item={item} />
}
