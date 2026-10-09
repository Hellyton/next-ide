import { describe, expect, it } from 'vitest'
import { clampBlur, clampTransparency, MAX_TRANSPARENCY } from '../../src/shared/models'

describe('clampTransparency', () => {
  it('keeps a valid percent and treats anything else as opaque', () => {
    expect(clampTransparency(20)).toBe(20)
    expect(clampTransparency(undefined)).toBe(0)
    expect(clampTransparency('40')).toBe(0)
    expect(clampTransparency(Number.NaN)).toBe(0)
  })

  it('never lets the window fade past the limit', () => {
    expect(clampTransparency(100)).toBe(MAX_TRANSPARENCY)
    expect(clampTransparency(-5)).toBe(0)
  })
})

describe('clampBlur', () => {
  it('keeps a percent within 0..100 and treats anything else as no blur', () => {
    expect(clampBlur(50)).toBe(50)
    expect(clampBlur(300)).toBe(100)
    expect(clampBlur(null)).toBe(0)
  })
})
