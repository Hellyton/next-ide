import { describe, expect, it } from 'vitest'
import { formatBuildInfo } from '@renderer/sidebar/buildInfo'

describe('formatBuildInfo', () => {
  it('shows version, short commit and local build date/time', () => {
    const at = new Date(2026, 8, 27, 18, 40).toISOString()
    expect(formatBuildInfo({ version: '0.1.0', commit: 'd99c83a', dirty: false, builtAt: at })).toBe('v0.1.0 · d99c83a · 27/09 18:40')
  })

  it('marks a build made with uncommitted changes', () => {
    const at = new Date(2026, 0, 5, 9, 3).toISOString()
    expect(formatBuildInfo({ version: '0.1.0', commit: 'abc1234', dirty: true, builtAt: at })).toBe('v0.1.0 · abc1234+ · 05/01 09:03')
  })

  it('omits the commit when git was unavailable at build time', () => {
    const at = new Date(2026, 0, 5, 9, 3).toISOString()
    expect(formatBuildInfo({ version: '0.1.0', commit: null, dirty: false, builtAt: at })).toBe('v0.1.0 · 05/01 09:03')
  })
})
