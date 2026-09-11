import { describe, expect, it } from 'vitest'
import { appendSnippet, applyMention, formatMention, mentionQuery, pickAgentPanel } from '@renderer/agent/mentions'

describe('formatMention', () => {
  it('uses project-relative paths and optional line ranges', () => {
    expect(formatMention('/p', '/p/src/a.ts')).toBe('@src/a.ts')
    expect(formatMention('/p', '/p/src/a.ts', { start: 10, end: 10 })).toBe('@src/a.ts#L10')
    expect(formatMention('/p', '/p/src/a.ts', { start: 20, end: 10 })).toBe('@src/a.ts#L10-20')
    expect(formatMention('/p', '/other/x.ts')).toBe('@/other/x.ts')
  })
})

describe('mentionQuery', () => {
  it('finds an @ token that ends at the caret', () => {
    expect(mentionQuery('veja @src/ap', 12)).toEqual({ query: 'src/ap', start: 5 })
    expect(mentionQuery('@', 1)).toEqual({ query: '', start: 0 })
    expect(mentionQuery('linha 1\n@x', 10)).toEqual({ query: 'x', start: 8 })
  })
  it('ignores e-mails, finished tokens and carets elsewhere', () => {
    expect(mentionQuery('mail a@b.com', 12)).toBeNull()
    expect(mentionQuery('@src/a.ts ', 10)).toBeNull()
    expect(mentionQuery('@src e mais', 11)).toBeNull()
  })
})

describe('applyMention', () => {
  it('replaces the whole token (even past the caret) and places the caret after it', () => {
    expect(applyMention('veja @ap agora', 5, 8, 'src/app.ts')).toEqual({ text: 'veja @src/app.ts agora', caret: 17 })
    expect(applyMention('@a', 0, 2, 'a.ts')).toEqual({ text: '@a.ts ', caret: 6 })
    expect(applyMention('@apxyz fim', 0, 3, 'app.ts')).toEqual({ text: '@app.ts fim', caret: 8 })
  })
})

describe('appendSnippet', () => {
  it('keeps one space between existing text and the snippet', () => {
    expect(appendSnippet('', '@a.ts')).toBe('@a.ts ')
    expect(appendSnippet('olha', '@a.ts')).toBe('olha @a.ts ')
    expect(appendSnippet('olha ', '@a.ts')).toBe('olha @a.ts ')
  })
})

describe('pickAgentPanel', () => {
  const c = [
    { id: 'a1', projectPath: '/p', visible: false },
    { id: 'a2', projectPath: '/p', visible: true },
    { id: 'b1', projectPath: '/q', visible: true },
  ]
  it('prefers the remembered agent, then a visible one, then any, of the same project', () => {
    expect(pickAgentPanel(c, '/p', 'a1')).toBe('a1')
    expect(pickAgentPanel(c, '/p', 'b1')).toBe('a2')
    expect(pickAgentPanel(c, '/p')).toBe('a2')
    expect(pickAgentPanel([c[0]!], '/p')).toBe('a1')
    expect(pickAgentPanel(c, '/z')).toBeNull()
  })
})
