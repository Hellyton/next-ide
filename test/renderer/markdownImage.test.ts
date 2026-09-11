import { describe, expect, it } from 'vitest'
import { markdownImageMode, markdownUrlTransform } from '@renderer/agent/markdownImage'

describe('markdownImageMode', () => {
  it('inlines only embedded data: images', () => {
    expect(markdownImageMode('data:image/png;base64,AAAA')).toBe('inline')
    expect(markdownImageMode('DATA:image/gif;base64,R0lG')).toBe('inline')
  })

  it('never loads anything else, rendering a link instead', () => {
    for (const src of ['https://example.com/a.png', 'http://x/y.gif', 'file:///etc/passwd', 'a.png', '//cdn/x.png', 'data:text/html,<b>x</b>', '', undefined]) {
      expect(markdownImageMode(src)).toBe('link')
    }
  })
})

describe('markdownUrlTransform', () => {
  it('keeps data: images for img src and falls back to the default sanitizer elsewhere', () => {
    expect(markdownUrlTransform('data:image/png;base64,AAAA', 'src')).toBe('data:image/png;base64,AAAA')
    expect(markdownUrlTransform('data:image/png;base64,AAAA', 'href')).toBe('')
    expect(markdownUrlTransform('javascript:alert(1)', 'href')).toBe('')
    expect(markdownUrlTransform('https://example.com', 'href')).toBe('https://example.com')
  })
})
