import { describe, expect, it } from 'vitest'
import { toSlash } from '@shared/slash'

describe('toSlash', () => {
  it('turns Windows backslashes into slashes only on win32', () => {
    expect(toSlash('C:\\Users\\me\\proj', 'win32')).toBe('C:/Users/me/proj')
    expect(toSlash('/odd\\name', 'darwin')).toBe('/odd\\name')
  })
})
