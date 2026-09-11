import { describe, expect, it } from 'vitest'
import { sanitizeLayout } from '@shared/layout'

describe('sanitizeLayout', () => {
  it('accepts a v1 layout with grid and panels', () => {
    const dock = { grid: { root: {} }, panels: {} }
    expect(sanitizeLayout({ version: 1, dock })).toEqual({ version: 1, dock })
  })

  it.each([null, 42, 'x', {}, { version: 2, dock: { grid: {}, panels: {} } }, { version: 1, dock: { grid: {} } }])(
    'rejects %j',
    (value) => {
      expect(sanitizeLayout(value)).toBeNull()
    },
  )
})
