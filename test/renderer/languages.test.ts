import { describe, expect, it } from 'vitest'
import { langForPath } from '@renderer/files/languages'

describe('langForPath', () => {
  it('maps extensions and special file names', () => {
    expect(langForPath('/p/src/a.ts')).toBe('typescript')
    expect(langForPath('/p/src/A.TSX')).toBe('tsx')
    expect(langForPath('/p/x.mjs')).toBe('javascript')
    expect(langForPath('/p/Dockerfile')).toBe('dockerfile')
    expect(langForPath('/p/Dockerfile.dev')).toBe('dockerfile')
    expect(langForPath('/p/Makefile')).toBe('make')
    expect(langForPath('/p/tsconfig.json')).toBe('jsonc')
    expect(langForPath('/p/.env')).toBe('ini')
    expect(langForPath('/p/script.zsh')).toBe('shellscript')
  })
  it('falls back to text', () => {
    expect(langForPath('/p/.gitignore')).toBe('text')
    expect(langForPath('/p/LICENSE')).toBe('text')
    expect(langForPath('/p/a.unknownext')).toBe('text')
  })
})
