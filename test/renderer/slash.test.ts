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
    expect(merged.map((c) => c.name)).toEqual(['resume', 'clear', 'model', 'statusline', 'btw', 'compact', 'review'])
  })
  it('ranks prefix matches first and caps at 8', () => {
    expect(filterCommands(merged, 're').map((c) => c.name)).toEqual(['resume', 'review'])
    expect(filterCommands(merged, '').length).toBeLessThanOrEqual(8)
  })
})

describe('classifySlash', () => {
  it('routes local, tui-only and pass-through commands', () => {
    expect(classifySlash('/resume')).toEqual({ kind: 'local', name: 'resume' })
    expect(classifySlash('  /clear  ')).toEqual({ kind: 'local', name: 'clear' })
    expect(classifySlash('/login')).toEqual({ kind: 'tui', name: 'login' })
    expect(classifySlash('/compact foco em testes')).toEqual({ kind: 'send' })
    expect(classifySlash('oi')).toEqual({ kind: 'send' })
  })
  it('routes /btw with its (multi-line) question, even an empty one', () => {
    expect(classifySlash('/btw qual arquivo você está editando?')).toEqual({ kind: 'btw', question: 'qual arquivo você está editando?' })
    expect(classifySlash('/btw linha 1\nlinha 2')).toEqual({ kind: 'btw', question: 'linha 1\nlinha 2' })
    expect(classifySlash('/btw')).toEqual({ kind: 'btw', question: '' })
    expect(classifySlash('/btwx')).toEqual({ kind: 'send' })
  })
})
