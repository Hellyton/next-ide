import { useEffect, useMemo, useState } from 'react'
import type { ToolItem } from '../../../agent/chatReducer'
import { ansiToSpans } from '../../../agent/ansi'
import { classifyOutputLine, type OutputLineKind } from '../../../agent/outputStyle'
import { highlightInline } from '../../../files/highlighter'
import { ToolStatus } from './GenericToolCard'

const LINE_CLASS: Record<Exclude<OutputLineKind, undefined>, string> = {
  error: 'text-red-300',
  warn: 'text-amber-300',
  ok: 'text-emerald-300',
  path: 'text-sky-300',
}

function ShellCommand({ command }: { command: string }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    highlightInline(command, 'shellscript')
      .then((next) => alive && setHtml(next))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [command])
  // shiki escapes the command; the markup is only its own <span>s.
  if (html) return <code className="chat-code truncate" dangerouslySetInnerHTML={{ __html: html }} />
  return <code className="truncate text-neutral-400">{command}</code>
}

export function BashCard({ item }: { item: ToolItem }) {
  const command = typeof (item.input as { command?: unknown })?.command === 'string' ? (item.input as { command: string }).command : ''
  const output = item.output ?? ''
  const spans = useMemo(() => ansiToSpans(output), [output])
  // Commands that print no ANSI (piped output, most build tools) still get terminal-like colors.
  const plain = spans.every((s) => !s.color)
  return (
    <details open className="rounded border border-neutral-800 text-xs" data-testid="bash-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-neutral-300">Bash</span>
        <ShellCommand command={command} />
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && (
        <pre className={`max-h-72 overflow-auto border-t border-neutral-800 bg-black/40 p-2 font-mono whitespace-pre-wrap ${item.isError ? 'text-red-300' : 'text-neutral-400'}`}>
          {!output ? (
            '(sem saída)'
          ) : plain && !item.isError ? (
            output.split('\n').map((line, i) => {
              const kind = classifyOutputLine(line)
              return (
                <div key={i} className={kind ? LINE_CLASS[kind] : undefined}>
                  {line || ' '}
                </div>
              )
            })
          ) : (
            spans.map((s, i) => (
              <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
                {s.text}
              </span>
            ))
          )}
        </pre>
      )}
    </details>
  )
}
