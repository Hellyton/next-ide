import { describe, expect, it } from 'vitest'
import { loginShellPath, mergePath, resolveClaudePath } from '../../src/main/env/loginShell'

describe('mergePath', () => {
  it('puts login entries first and dedupes', () => {
    expect(mergePath('/usr/bin:/bin', '/Users/me/.local/bin:/usr/bin')).toBe('/Users/me/.local/bin:/usr/bin:/bin')
    expect(mergePath(undefined, null)).toBe('')
  })
})

describe('resolveClaudePath', () => {
  const deps = (existing: string[], which: string | null) => ({
    exists: (p: string) => existing.includes(p),
    home: '/Users/me',
    which: async () => which,
  })
  it('prefers the configured path, then ~/.local/bin/claude, then the login shell', async () => {
    expect(await resolveClaudePath('/opt/claude', deps(['/opt/claude', '/Users/me/.local/bin/claude'], '/x'))).toBe('/opt/claude')
    expect(await resolveClaudePath('/missing', deps(['/Users/me/.local/bin/claude'], '/x'))).toBe('/Users/me/.local/bin/claude')
    expect(await resolveClaudePath(undefined, deps([], '/usr/local/bin/claude'))).toBe('/usr/local/bin/claude')
    expect(await resolveClaudePath(undefined, deps([], null))).toBeUndefined()
  })
})

describe('loginShellPath', () => {
  it('reads PATH from a login shell', async () => {
    expect(await loginShellPath('/bin/sh')).toMatch(/\/bin/)
  })
  it('returns null when the shell cannot run', async () => {
    expect(await loginShellPath('/nope/shell')).toBeNull()
  })
})
