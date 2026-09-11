import type { ToolItem } from '../../../agent/chatReducer'

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

export function GenericToolCard({ item }: { item: ToolItem }) {
  return (
    <details className="rounded border border-neutral-800 text-xs" data-testid="tool-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-neutral-300">
        <span className="font-medium">{item.name}</span>
        <span className="truncate text-neutral-500">{toolSummary(item.input)}</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      {item.output !== undefined && <pre className="max-h-64 overflow-auto border-t border-neutral-800 p-2 whitespace-pre-wrap text-neutral-400">{item.output}</pre>}
    </details>
  )
}
