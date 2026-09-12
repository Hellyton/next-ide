import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { SupportedLang } from './languages'

export const THEME = 'github-dark'
/** Above this, tokenizing blocks the UI for too long: render as plain text (still with line numbers). */
const PLAIN_ABOVE = 200_000

type LangInput = Parameters<HighlighterCore['loadLanguage']>[0]

// One dynamic import per language: Vite splits each grammar into its own chunk, loaded on first use.
const LOADERS: Record<SupportedLang, LangInput> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  markdown: () => import('@shikijs/langs/markdown'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  html: () => import('@shikijs/langs/html'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  ruby: () => import('@shikijs/langs/ruby'),
  php: () => import('@shikijs/langs/php'),
  lua: () => import('@shikijs/langs/lua'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  xml: () => import('@shikijs/langs/xml'),
  sql: () => import('@shikijs/langs/sql'),
  graphql: () => import('@shikijs/langs/graphql'),
  prisma: () => import('@shikijs/langs/prisma'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  make: () => import('@shikijs/langs/make'),
  diff: () => import('@shikijs/langs/diff'),
}

async function ensureLanguage(hl: HighlighterCore, lang: SupportedLang | 'text'): Promise<SupportedLang | 'text'> {
  if (lang === 'text' || hl.getLoadedLanguages().includes(lang)) return lang
  try {
    await hl.loadLanguage(LOADERS[lang])
    return lang
  } catch (err) {
    console.error('[next-ide] failed to load grammar', lang, err)
    return 'text'
  }
}

let highlighter: Promise<HighlighterCore> | null = null
const getHighlighter = () => {
  if (!highlighter) {
    highlighter = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark')],
      langs: [],
      // JS regex engine: no WebAssembly, so the production CSP stays as is. `forgiving` skips the
      // rare grammar patterns it can't translate instead of throwing.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    }).catch((err: unknown) => {
      // Don't cache a failed init forever: the next call gets a fresh attempt.
      highlighter = null
      throw err
    })
  }
  return highlighter
}

/** Same colors, but plain <span>s: for a single line inside an existing element. */
export async function highlightInline(code: string, lang: SupportedLang | 'text'): Promise<string> {
  const hl = await getHighlighter()
  const target = await ensureLanguage(hl, lang)
  return hl.codeToHtml(code, { lang: target, theme: THEME, structure: 'inline' })
}

export async function highlight(code: string, lang: SupportedLang | 'text'): Promise<string> {
  const hl = await getHighlighter()
  const target = await ensureLanguage(hl, code.length > PLAIN_ABOVE ? 'text' : lang)
  return hl.codeToHtml(code, { lang: target, theme: THEME })
}
