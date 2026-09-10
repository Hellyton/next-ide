import { describe, expect, it } from 'vitest'
import { parseCodeWorkspace, stripJsonc } from '../../src/main/store/codeWorkspace'

describe('stripJsonc', () => {
  it('removes comments and trailing commas but keeps strings', () => {
    const src = `{
      // line comment
      "a": "http://x", /* block */
      "b": [1, 2,],
    }`
    expect(JSON.parse(stripJsonc(src))).toEqual({ a: 'http://x', b: [1, 2] })
  })

  it('keeps escaped quotes inside strings', () => {
    expect(JSON.parse(stripJsonc('{"a": "say \\"hi\\" // not comment"}'))).toEqual({
      a: 'say "hi" // not comment',
    })
  })

  it('does not touch commas inside strings', () => {
    expect(JSON.parse(stripJsonc('{"a": "x,}", "b": "y, ]", "c": [1, 2,],}'))).toEqual({
      a: 'x,}',
      b: 'y, ]',
      c: [1, 2],
    })
  })

  it('removes a trailing comma followed by a comment', () => {
    expect(JSON.parse(stripJsonc('{"a": 1, // c\n}'))).toEqual({ a: 1 })
  })
})

describe('parseCodeWorkspace', () => {
  it('resolves relative folders against the workspace file', () => {
    const json = `{ "folders": [ { "path": "papersystem-ui" }, { "path": "/abs/api" }, ], "settings": {} }`
    expect(parseCodeWorkspace(json, '/Users/me/work/papersystem.code-workspace')).toEqual({
      name: 'papersystem',
      paths: ['/Users/me/work/papersystem-ui', '/abs/api'],
    })
  })

  it('returns empty paths when folders missing', () => {
    expect(parseCodeWorkspace('{}', '/x/y.code-workspace')).toEqual({ name: 'y', paths: [] })
  })
})
