import { describe, expect, it } from 'vitest'
import { langForFence } from '@renderer/files/languages'

describe('langForFence', () => {
  it('maps fence names, extensions and aliases', () => {
    expect(langForFence('typescript')).toBe('typescript')
    expect(langForFence('ts')).toBe('typescript')
    expect(langForFence('TSX')).toBe('tsx')
    expect(langForFence('bash')).toBe('shellscript')
    expect(langForFence('shell')).toBe('shellscript')
    expect(langForFence('console')).toBe('shellscript')
    expect(langForFence('py')).toBe('python')
    expect(langForFence('yml')).toBe('yaml')
    expect(langForFence('c++')).toBe('cpp')
  })
  it('falls back to text', () => {
    expect(langForFence('text')).toBe('text')
    expect(langForFence('mermaid')).toBe('text')
  })
})
