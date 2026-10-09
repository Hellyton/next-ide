import { describe, expect, it } from 'vitest'
import { mergeProjectDefaults } from '@shared/models'

describe('mergeProjectDefaults', () => {
  it('keeps the last model/effort/mode chosen', () => {
    expect(mergeProjectDefaults(undefined, { model: 'opus' })).toEqual({ model: 'opus' })
    expect(mergeProjectDefaults({ model: 'opus' }, { effort: 'low', permissionMode: 'plan' })).toEqual({ model: 'opus', effort: 'low', permissionMode: 'plan' })
  })

  it('clears effort on auto and never remembers bypass', () => {
    expect(mergeProjectDefaults({ effort: 'low', permissionMode: 'plan' }, { effort: null })).toEqual({ permissionMode: 'plan' })
    expect(mergeProjectDefaults({ permissionMode: 'plan' }, { permissionMode: 'bypassPermissions' })).toEqual({ permissionMode: 'plan' })
  })
})
