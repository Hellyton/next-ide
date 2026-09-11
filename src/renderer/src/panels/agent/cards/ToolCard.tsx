import type { ChatItem, ToolItem } from '../../../agent/chatReducer'
import { isTaskTool } from '../../../agent/chatTree'
import { isQuietTool, toolDiff, toolTodos } from '../../../agent/toolView'
import { BashCard } from './BashCard'
import { DiffCard } from './DiffCard'
import { GenericToolCard } from './GenericToolCard'
import { TaskCard } from './TaskCard'
import { TodoCard } from './TodoCard'

export function ToolCard({ item, descendants, panelId }: { item: ToolItem; descendants?: ChatItem[] | undefined; panelId: string }) {
  if (isTaskTool(item.name)) return <TaskCard item={item} descendants={descendants} panelId={panelId} />
  if (item.name === 'Bash') return <BashCard item={item} />
  const diff = toolDiff(item.name, item.input)
  if (diff) return <DiffCard item={item} filePath={diff.filePath} lines={diff.lines} />
  const todos = item.name === 'TodoWrite' ? toolTodos(item.input) : null
  if (todos) return <TodoCard todos={todos} />
  if (isQuietTool(item.name)) return <GenericToolCard item={item} />
  return <GenericToolCard item={item} />
}
