import { describe, expect, it } from 'vitest'
import { LOCAL_COMMANDS, classifySlash, filterCommands, mergeCommands, slashQuery } from '@renderer/agent/slash'

describe('slashQuery', () => {
  it('returns the partial command while typing a single slash word', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/com')).toBe('com')
    expect(slashQuery('/compact agora')).toBeNull()
    expect(slashQuery('oi /x')).toBeNull()
  })
})

describe('mergeCommands / filterCommands', () => {
  const merged = mergeCommands([{ name: 'compact', description: 'Compacta', argumentHint: '' }, { name: 'clear', description: 'dup', argumentHint: '' }], ['review', 'compact'])
  it('puts local commands first, dedupes, and appends init-only names', () => {
    expect(merged.slice(0, LOCAL_COMMANDS.length).every((c) => c.local)).toBe(true)
    expect(merged.filter((c) => c.name === 'clear')).toHaveLength(1)
    expect(merged.map((c) => c.name)).toEqual([
      'resume', 'clear', 'model', 'statusline', 'btw', 'rewind', 'context', 'effort', 'rename', 'fork', 'mcp', 'agents', 'add-dir', 'compact', 'review',
    ])
  })
  it('ranks prefix matches first and caps at 50', () => {
    expect(filterCommands(merged, 're').map((c) => c.name)).toEqual(['resume', 'rewind', 'rename', 'review'])
    // Build 60 items to verify cap at 50
    const manyItems = mergeCommands(
      Array.from({ length: 60 }, (_, i) => ({ name: `cmd${i}`, description: '', argumentHint: '' })),
      []
    )
    expect(filterCommands(manyItems, '').length).toBe(50)
  })
  it('shows SDK commands in menu even with more local commands', () => {
    const withSDK = mergeCommands([{ name: 'compact', description: 'Compacta', argumentHint: '' }], [])
    expect(filterCommands(withSDK, '').map((c) => c.name)).toContain('compact')
  })
})

describe('classifySlash', () => {
  it('routes local, tui-only and pass-through commands', () => {
    expect(classifySlash('/resume')).toEqual({ kind: 'local', name: 'resume', arg: '' })
    expect(classifySlash('  /clear  ')).toEqual({ kind: 'local', name: 'clear', arg: '' })
    expect(classifySlash('/login')).toEqual({ kind: 'tui', name: 'login' })
    expect(classifySlash('/login foo')).toEqual({ kind: 'send' })
    expect(classifySlash('/compact foco em testes')).toEqual({ kind: 'send' })
    expect(classifySlash('oi')).toEqual({ kind: 'send' })
  })
  it('passes the argument of local commands', () => {
    expect(classifySlash('/rename  Refactor do login ')).toEqual({ kind: 'local', name: 'rename', arg: 'Refactor do login' })
    expect(classifySlash('/effort high')).toEqual({ kind: 'local', name: 'effort', arg: 'high' })
    expect(classifySlash('/rewind')).toEqual({ kind: 'local', name: 'rewind', arg: '' })
    expect(classifySlash('/context')).toEqual({ kind: 'local', name: 'context', arg: '' })
    expect(classifySlash('/fork')).toEqual({ kind: 'local', name: 'fork', arg: '' })
    expect(classifySlash('/fork Experimento A')).toEqual({ kind: 'local', name: 'fork', arg: 'Experimento A' })
    expect(classifySlash('/mcp')).toEqual({ kind: 'local', name: 'mcp', arg: '' })
    expect(classifySlash('/agents')).toEqual({ kind: 'local', name: 'agents', arg: '' })
    expect(classifySlash('/add-dir /tmp/x')).toEqual({ kind: 'local', name: 'add-dir', arg: '/tmp/x' })
  })
  it('routes /btw with its (multi-line) question, even an empty one', () => {
    expect(classifySlash('/btw qual arquivo você está editando?')).toEqual({ kind: 'btw', question: 'qual arquivo você está editando?' })
    expect(classifySlash('/btw linha 1\nlinha 2')).toEqual({ kind: 'btw', question: 'linha 1\nlinha 2' })
    expect(classifySlash('/btw')).toEqual({ kind: 'btw', question: '' })
    expect(classifySlash('/btwx')).toEqual({ kind: 'send' })
  })
})
