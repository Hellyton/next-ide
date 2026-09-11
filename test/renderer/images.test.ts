import { describe, expect, it } from 'vitest'
import { canSend, MAX_IMAGE_BYTES, stripDataUrl, validateImage } from '@renderer/agent/images'

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

describe('canSend', () => {
  it('allows sending text with no images while nothing is reading', () => {
    expect(canSend({ text: 'oi', images: 0, reading: 0 })).toBe(true)
  })
  it('allows sending images with no text while nothing is reading', () => {
    expect(canSend({ text: '', images: 1, reading: 0 })).toBe(true)
  })
  it('blocks sending while an image is still being read', () => {
    expect(canSend({ text: 'oi', images: 0, reading: 1 })).toBe(false)
  })
  it('blocks sending when text is only whitespace and there are no images', () => {
    expect(canSend({ text: '  ', images: 0, reading: 0 })).toBe(false)
  })
})
