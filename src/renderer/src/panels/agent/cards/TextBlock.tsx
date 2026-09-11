import { isValidElement, memo, useEffect, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownImageMode, markdownUrlTransform } from '../../../agent/markdownImage'
import { highlight } from '../../../files/highlighter'
import { langForFence } from '../../../files/languages'

// Palette close to the Claude Code CLI: dim body text, bright bold, orange headings, lavender inline code.
const ORANGE = 'text-[#d97757]'

function CodeBlock({ lang, text }: { lang: string | undefined; text: string }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    const target = lang ? langForFence(lang) : 'text'
    if (target === 'text') {
      setHtml(null)
      return
    }
    let alive = true
    highlight(text, target)
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setHtml(null))
    return () => {
      alive = false
    }
  }, [lang, text])
  if (html) {
    // shiki escapes the source text; the markup is its own <pre><code>.
    return <div data-testid="code-block" className="chat-code my-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs" dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <pre data-testid="code-block" className="my-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs text-neutral-300">
      <code>{text}</code>
    </pre>
  )
}

const components: Components = {
  img: ({ src, alt }) => {
    const url = typeof src === 'string' ? src : undefined
    if (markdownImageMode(url) === 'inline') return <img src={url} alt={alt ?? ''} className="my-2 max-w-full rounded" />
    const label = `🖼 ${alt || url || 'imagem'}`
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 underline" data-testid="markdown-image-link">
        {label}
      </a>
    ) : (
      <span className="text-neutral-400">{label}</span>
    )
  },
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky-400 underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-neutral-50">{children}</strong>,
  em: ({ children }) => <em className="text-neutral-200 italic">{children}</em>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 marker:text-neutral-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 marker:text-neutral-500">{children}</ol>,
  h1: ({ children }) => <h1 className={`mt-3 mb-2 text-lg font-semibold ${ORANGE}`}>{children}</h1>,
  h2: ({ children }) => <h2 className={`mt-3 mb-2 text-base font-semibold ${ORANGE}`}>{children}</h2>,
  h3: ({ children }) => <h3 className={`mt-3 mb-1 font-semibold ${ORANGE}`}>{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-1 font-semibold text-neutral-100">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-[#d97757]/60 pl-3 text-neutral-400 italic">{children}</blockquote>,
  hr: () => <hr className="my-3 border-neutral-800" />,
  // Fenced blocks: the child is the <code> element with `language-xx`; highlight it with shiki.
  pre: ({ children }) => {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children.props : undefined
    const lang = /language-([\w+#-]+)/.exec(code?.className ?? '')?.[1]
    const text = String(code?.children ?? '').replace(/\n$/, '')
    return <CodeBlock lang={lang} text={text} />
  },
  code: ({ children, className }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-neutral-800/70 px-1 py-0.5 text-[0.85em] text-[#b1b9f9]">{children}</code>
    ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-neutral-700 px-2 py-1 text-left text-neutral-100">{children}</th>,
  td: ({ children }) => <td className="border border-neutral-800 px-2 py-1">{children}</td>,
}

export const TextBlock = memo(function TextBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="text-sm text-neutral-300" data-testid="assistant-text">
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={markdownUrlTransform}>
        {text}
      </Markdown>
      {streaming && <span className="inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-middle" />}
    </div>
  )
})
