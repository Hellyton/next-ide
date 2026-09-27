import { describe, expect, it } from 'vitest'
import { parseDictationLine } from '@shared/dictation'

describe('parseDictationLine', () => {
  it('parses every helper event', () => {
    expect(parseDictationLine('{"type":"ready"}')).toEqual({ type: 'ready' })
    expect(parseDictationLine('{"type":"status","text":"baixando"}')).toEqual({ type: 'status', text: 'baixando' })
    expect(parseDictationLine('{"type":"transcript","final":"abre","volatile":" o"}')).toEqual({ type: 'transcript', final: 'abre', volatile: ' o' })
    expect(parseDictationLine('{"type":"error","message":"sem mic"}')).toEqual({ type: 'error', message: 'sem mic' })
  })

  it('trims surrounding whitespace', () => {
    expect(parseDictationLine('  {"type":"ready"}\r')).toEqual({ type: 'ready' })
  })

  it('rejects garbage, unknown types, missing fields and main-only events', () => {
    expect(parseDictationLine('')).toBeNull()
    expect(parseDictationLine('not json')).toBeNull()
    expect(parseDictationLine('[1]')).toBeNull()
    expect(parseDictationLine('null')).toBeNull()
    expect(parseDictationLine('{"type":"bogus"}')).toBeNull()
    expect(parseDictationLine('{"type":"transcript","final":"a"}')).toBeNull()
    expect(parseDictationLine('{"type":"status","text":3}')).toBeNull()
    expect(parseDictationLine('{"type":"error"}')).toBeNull()
    expect(parseDictationLine('{"type":"ended"}')).toBeNull()
  })
})
