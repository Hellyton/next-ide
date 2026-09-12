import { describe, expect, it } from 'vitest'
import { clampSidebarWidth, DEFAULT_SIDEBAR, MIN_SIDEBAR } from '@renderer/layout/sidebarWidth'

describe('clampSidebarWidth', () => {
  it('keeps the width between the minimum and 60% of the window (capped)', () => {
    expect(clampSidebarWidth(400, 1600)).toBe(400)
    expect(clampSidebarWidth(50, 1600)).toBe(MIN_SIDEBAR)
    expect(clampSidebarWidth(1500, 1600)).toBe(720)
    expect(clampSidebarWidth(900, 1000)).toBe(600)
    expect(clampSidebarWidth(500, 300)).toBe(MIN_SIDEBAR)
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR)
  })
})
