import { describe, expect, it } from 'vitest'
import { shellEnv } from '../../src/main/pty/shellEnv'

describe('shellEnv', () => {
  it('strips NEXT_IDE_* app env vars', () => {
    const env = shellEnv({
      NEXT_IDE_USER_DATA: '/tmp/foo',
      NEXT_IDE_E2E_PICK_FOLDER: '/tmp/bar',
      PATH: '/usr/bin',
    })
    expect(env.NEXT_IDE_USER_DATA).toBeUndefined()
    expect(env.NEXT_IDE_E2E_PICK_FOLDER).toBeUndefined()
  })

  it('strips ELECTRON_RENDERER_URL', () => {
    const env = shellEnv({ ELECTRON_RENDERER_URL: 'http://localhost:5173', PATH: '/usr/bin' })
    expect(env.ELECTRON_RENDERER_URL).toBeUndefined()
  })

  it('keeps PATH and HOME', () => {
    const env = shellEnv({ PATH: '/usr/bin', HOME: '/Users/me' })
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/Users/me')
  })

  it('sets TERM_PROGRAM to next-ide', () => {
    const env = shellEnv({ PATH: '/usr/bin' })
    expect(env.TERM_PROGRAM).toBe('next-ide')
  })

  it('drops undefined values so the result is a Record<string, string>', () => {
    const env = shellEnv({ PATH: '/usr/bin', UNSET_VAR: undefined })
    expect('UNSET_VAR' in env).toBe(false)
    for (const value of Object.values(env)) {
      expect(typeof value).toBe('string')
    }
  })
})
