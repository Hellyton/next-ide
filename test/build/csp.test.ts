import { describe, expect, it } from 'vitest'
import { PRODUCTION_CSP, injectCsp } from '../../build/csp'

describe('injectCsp', () => {
  it('adds the CSP meta right after <head>', () => {
    const out = injectCsp('<html><head><title>x</title></head></html>')
    expect(out).toContain(`<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`)
  })

  it('blocks remote scripts and objects', () => {
    expect(PRODUCTION_CSP).toContain("script-src 'self'")
    expect(PRODUCTION_CSP).toContain("object-src 'none'")
    expect(PRODUCTION_CSP).not.toContain('unsafe-eval')
  })
})
