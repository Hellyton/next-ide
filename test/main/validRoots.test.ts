import { describe, expect, it } from 'vitest'
import { validRoots } from '../../src/main/fs/validRoots'

describe('validRoots', () => {
  it('keeps only absolute string paths, dropping malformed workspace entries', () => {
    expect(validRoots(['/a/b', 'relative/path', '', 42, null, undefined, {}, ['/x'], '/c/d'])).toEqual(['/a/b', '/c/d'])
  })
})
