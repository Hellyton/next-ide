import { useMemo } from 'react'
import type { ToolItem } from '../../../agent/chatReducer'
import { ansiToSpans } from '../../../agent/ansi'
import { ToolStatus } from './GenericToolCard'

export function BashCard({ item }: { item: ToolItem }) {
  const command = typeof (item.input as { command?: unknown })?.command === 'string' ? (item.input as { command: string }).command : ''
  const spans = useMemo(() => ansiToSpans(item.output ?? ''), [item.output])
  return (
    <details open className="rounded border border-neutral-800 text-xs" data-testid="bash-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-neutral-300">Bash</span>
        <code className="truncate text-neutral-400">{command}</code>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && (
        <pre className={`max-h-72 overflow-auto border-t border-neutral-800 bg-black/40 p-2 font-mono whitespace-pre-wrap ${item.isError ? 'text-red-300' : 'text-neutral-300'}`}>
          {item.output
            ? spans.map((s, i) => (
                <span key={i} style={{ color: s.color, fontWeight: s.bold ? 600 : undefined, opacity: s.dim ? 0.6 : undefined }}>
                  {s.text}
                </span>
              ))
            : '(sem saída)'}
        </pre>
      )}
    </details>
  )
}
