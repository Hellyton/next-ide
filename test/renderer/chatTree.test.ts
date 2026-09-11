import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@renderer/agent/chatReducer'
import { descendantsByTask, isChildItem, sameItems } from '@renderer/agent/chatTree'

const text = (key: string, parentToolUseId?: string): ChatItem => ({ type: 'text', key, text: key, final: true, ...(parentToolUseId ? { parentToolUseId } : {}) })
const tool = (id: string, parentToolUseId?: string): ChatItem => ({ type: 'tool', id, name: 'Task', input: {}, ...(parentToolUseId ? { parentToolUseId } : {}) })

describe('descendantsByTask', () => {
  it('groups every nested item under its top-level task, in chat order', () => {
    const a = text('a', 'T1')
    const t2 = tool('t2', 'T1')
    const b = text('b', 't2')
    const items: ChatItem[] = [{ type: 'user', id: 'u', text: 'oi', images: 0 }, tool('T1'), a, t2, text('c'), b, tool('T3')]
    const map = descendantsByTask(items)
    expect(map.get('T1')).toEqual([a, t2, b])
    expect(map.get('T1')![0]).toBe(a)
    expect(map.has('t2')).toBe(false)
    expect(map.get('T3')).toBeUndefined()
    expect(items.filter((i) => !isChildItem(i)).map((i) => i.type)).toEqual(['user', 'tool', 'text', 'tool'])
  })
})

describe('sameItems', () => {
  it('compares arrays by item identity', () => {
    const a = text('a')
    expect(sameItems([a], [a])).toBe(true)
    expect(sameItems(undefined, undefined)).toBe(true)
    expect(sameItems([a], [text('a')])).toBe(false)
    expect(sameItems([a], undefined)).toBe(false)
  })
})
