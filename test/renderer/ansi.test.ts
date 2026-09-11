import { describe, expect, it } from 'vitest'
import { ansiToSpans } from '@renderer/agent/ansi'

describe('ansiToSpans', () => {
  it('parses basic colors, bold, dim, reset and 24-bit/256 colors', () => {
    expect(ansiToSpans('\x1b[32mok\x1b[0m done')).toEqual([{ text: 'ok', color: '#4ade80' }, { text: ' done' }])
    expect(ansiToSpans('\x1b[1;31mX')).toEqual([{ text: 'X', color: '#f87171', bold: true }])
    expect(ansiToSpans('\x1b[2mdim')).toEqual([{ text: 'dim', dim: true }])
    expect(ansiToSpans('\x1b[38;2;255;0;128mrgb')).toEqual([{ text: 'rgb', color: 'rgb(255,0,128)' }])
    expect(ansiToSpans('\x1b[38;5;196mred')).toEqual([{ text: 'red', color: 'rgb(255,0,0)' }])
    expect(ansiToSpans('plain')).toEqual([{ text: 'plain' }])
  })

  it('never leaks raw escape bytes into span text', () => {
    expect(
      ansiToSpans('\x1b[31merro\x1b[0m\n')
        .map((s) => s.text)
        .join(''),
    ).toBe('erro\n')
  })
})
