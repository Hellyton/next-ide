import type { ChatItem } from './chatReducer'

export const parentOf = (item: ChatItem): string | undefined => (item.type === 'text' || item.type === 'tool' ? item.parentToolUseId : undefined)

export const isChildItem = (item: ChatItem): boolean => Boolean(parentOf(item))

export const isTaskTool = (name: string): boolean => name === 'Task' || name === 'Agent'

/**
 * Groups every nested item (subagent text/tools, at any depth) under its top-level task id,
 * in chat order. Each TaskCard then receives only its own subtree instead of the whole chat.
 */
export function descendantsByTask(items: ChatItem[]): Map<string, ChatItem[]> {
  const toolParent = new Map<string, string | undefined>()
  for (const item of items) if (item.type === 'tool') toolParent.set(item.id, item.parentToolUseId)
  const rootOf = (id: string): string => {
    let current = id
    for (let depth = 0; depth <= toolParent.size; depth++) {
      const parent = toolParent.get(current)
      if (!parent) return current
      current = parent
    }
    return current
  }
  const out = new Map<string, ChatItem[]>()
  for (const item of items) {
    const parent = parentOf(item)
    if (!parent) continue
    const root = rootOf(parent)
    const list = out.get(root)
    if (list) list.push(item)
    else out.set(root, [item])
  }
  return out
}

/** Shallow identity comparison, used to skip re-rendering cards whose subtree didn't change. */
export function sameItems(a: ChatItem[] | undefined, b: ChatItem[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((item, i) => item === b[i])
}
