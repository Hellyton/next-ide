import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownImageMode, markdownUrlTransform } from '../../../agent/markdownImage'

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
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-lg font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 font-semibold">{children}</h3>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs">{children}</pre>,
  code: ({ children, className }) =>
    className ? <code className={className}>{children}</code> : <code className="rounded bg-neutral-800 px-1 py-0.5 text-[0.85em]">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-neutral-700 px-2 py-1 text-left">{children}</th>,
  td: ({ children }) => <td className="border border-neutral-800 px-2 py-1">{children}</td>,
}

export function TextBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="text-sm text-neutral-200" data-testid="assistant-text">
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={markdownUrlTransform}>
        {text}
      </Markdown>
      {streaming && <span className="inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-middle" />}
    </div>
  )
}
