import { describe, expect, it } from 'vitest'
import { PROJECT_PALETTE, projectColor } from '@shared/projectColor'

describe('projectColor', () => {
  it('returns a palette color', () => {
    expect(PROJECT_PALETTE).toContain(projectColor('/Users/me/papersystem-api'))
  })

  it('is stable for the same path', () => {
    expect(projectColor('/a/b')).toBe(projectColor('/a/b'))
  })

  it('spreads different paths across several colors', () => {
    const paths = Array.from({ length: 24 }, (_, i) => `/Users/me/project-${i}`)
    const colors = new Set(paths.map(projectColor))
    expect(colors.size).toBeGreaterThan(4)
  })
})
