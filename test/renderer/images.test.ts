import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, stripDataUrl, validateImage } from '@renderer/agent/images'

describe('validateImage', () => {
  it('accepts supported types within the size limit', () => {
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 10 })).toBeNull()
    expect(validateImage({ name: 'a.webp', type: 'image/webp', size: MAX_IMAGE_BYTES })).toBeNull()
  })
  it('rejects unsupported types and oversized files with pt-BR messages', () => {
    expect(validateImage({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toBe('a.svg: formato não suportado (use png, jpg, gif ou webp)')
    expect(validateImage({ name: 'b.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('b.png: maior que 5 MB')
  })
})

describe('stripDataUrl', () => {
  it('returns the base64 payload', () => {
    expect(stripDataUrl('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(stripDataUrl('AAAA')).toBe('AAAA')
  })
})
