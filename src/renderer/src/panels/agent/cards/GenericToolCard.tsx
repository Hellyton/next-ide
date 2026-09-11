import type { ToolItem } from '../../../agent/chatReducer'
import { parseToolOutputLine, toolFileTarget } from '../../../agent/toolLinks'
import { FilePathLink } from './FilePathLink'

const LINKED_OUTPUT = new Set(['Grep', 'Glob'])

export function toolSummary(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const rec = input as Record<string, unknown>
  const first = rec.file_path ?? rec.path ?? rec.pattern ?? rec.command ?? rec.url ?? rec.description
  return typeof first === 'string' ? first : ''
}

export function ToolStatus({ item }: { item: ToolItem }) {
  if (item.output === undefined) return <span className="text-neutral-500">…</span>
  return item.isError ? <span className="text-red-400">✗</span> : <span className="text-emerald-400">✓</span>
}

function OutputLines({ output }: { output: string }) {
  return (
    <>
      {output.split('\n').map((line, i) => {
        const target = parseToolOutputLine(line)
        if (!target) return <div key={i}>{line}</div>
        const rest = target.line ? line.slice(line.indexOf(`:${target.line}:`) + `:${target.line}:`.length) : ''
        return (
          <div key={i} className="flex gap-1">
            <FilePathLink path={target.path} line={target.line} className="shrink-0 text-sky-300" />
            {rest && <span className="truncate">{rest}</span>}
          </div>
        )
      })}
    </>
  )
}

export function GenericToolCard({ item }: { item: ToolItem }) {
  const target = toolFileTarget(item.name, item.input)
  return (
    <details className="rounded border border-neutral-800 text-xs" data-testid="tool-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-neutral-300">
        <span className="font-medium">{item.name}</span>
        {target ? (
          <FilePathLink path={target.path} line={target.line} className="text-neutral-500" />
        ) : (
          <span className="truncate text-neutral-500">{toolSummary(item.input)}</span>
        )}
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && (
        <pre className="max-h-64 overflow-auto border-t border-neutral-800 p-2 whitespace-pre-wrap text-neutral-400">
          {LINKED_OUTPUT.has(item.name) && !item.isError ? <OutputLines output={item.output} /> : item.output}
        </pre>
      )}
    </details>
  )
}
