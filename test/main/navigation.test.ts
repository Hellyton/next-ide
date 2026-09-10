import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from '../../src/main/navigation'

describe('isAllowedNavigation', () => {
  it('allows navigation to the exact same url (reload)', () => {
    expect(isAllowedNavigation('http://localhost:5173/', 'http://localhost:5173/')).toBe(true)
  })

  it('rejects a different path on the same origin', () => {
    expect(isAllowedNavigation('http://localhost:5173/other', 'http://localhost:5173/')).toBe(false)
  })

  it('rejects a different origin', () => {
    expect(isAllowedNavigation('http://evil.example/', 'http://localhost:5173/')).toBe(false)
  })

  it('rejects a local file url', () => {
    expect(isAllowedNavigation('file:///etc/passwd', 'http://localhost:5173/')).toBe(false)
  })

  it('rejects a random https url', () => {
    expect(isAllowedNavigation('https://evil.example', 'file:///app/index.html')).toBe(false)
  })
})
