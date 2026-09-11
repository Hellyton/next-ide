import { beforeEach, describe, expect, it, vi } from 'vitest'

const createHighlighterCore = vi.fn()
vi.mock('shiki/core', () => ({ createHighlighterCore }))
vi.mock('shiki/engine/javascript', () => ({ createJavaScriptRegexEngine: () => ({}) }))

describe('highlight', () => {
  beforeEach(() => {
    vi.resetModules()
    createHighlighterCore.mockReset()
  })

  it('retries createHighlighterCore after an init failure instead of caching the rejection forever', async () => {
    createHighlighterCore.mockRejectedValueOnce(new Error('init boom'))
    const hl = { getLoadedLanguages: () => [], loadLanguage: vi.fn(), codeToHtml: () => '<pre>ok</pre>' }
    createHighlighterCore.mockResolvedValueOnce(hl)

    const { highlight } = await import('../../src/renderer/src/files/highlighter')
    await expect(highlight('a', 'text')).rejects.toThrow('init boom')
    await expect(highlight('a', 'text')).resolves.toBe('<pre>ok</pre>')
    expect(createHighlighterCore).toHaveBeenCalledTimes(2)
  })
})
