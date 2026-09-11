import { describe, expect, it } from 'vitest'
import { editDiff, isQuietTool, toolDiff, toolTodos } from '@renderer/agent/toolView'

describe('editDiff', () => {
  it('marks removed and added lines and keeps context', () => {
    expect(editDiff('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      { kind: 'ctx', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'ctx', text: 'c' },
    ])
  })
})

describe('toolDiff', () => {
  it('handles Edit, MultiEdit and Write', () => {
    expect(toolDiff('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' })).toEqual({
      filePath: '/a.ts',
      lines: [
        { kind: 'del', text: 'x' },
        { kind: 'add', text: 'y' },
      ],
    })
    const multi = toolDiff('MultiEdit', { file_path: '/a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] })
    expect(multi?.lines).toEqual([
      { kind: 'del', text: 'a' },
      { kind: 'add', text: 'b' },
      { kind: 'ctx', text: '⋯' },
      { kind: 'del', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(toolDiff('Write', { file_path: '/n.ts', content: 'l1\nl2' })?.lines).toEqual([
      { kind: 'add', text: 'l1' },
      { kind: 'add', text: 'l2' },
    ])
  })
  it('returns null for other tools or malformed input', () => {
    expect(toolDiff('Bash', { command: 'ls' })).toBeNull()
    expect(toolDiff('Edit', { file_path: '/a.ts' })).toBeNull()
  })
})

describe('toolTodos', () => {
  it('reads TodoWrite todos and rejects malformed input', () => {
    expect(toolTodos({ todos: [{ content: 'fazer', status: 'in_progress', activeForm: 'fazendo' }] })).toEqual([{ content: 'fazer', status: 'in_progress' }])
    expect(toolTodos({ todos: 'x' })).toBeNull()
  })
})

describe('isQuietTool', () => {
  it('collapses read-only tools', () => {
    expect(isQuietTool('Read')).toBe(true)
    expect(isQuietTool('Grep')).toBe(true)
    expect(isQuietTool('Bash')).toBe(false)
  })
})
