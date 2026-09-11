import type { DiffLine } from '../../../agent/toolView'
import type { ToolItem } from '../../../agent/chatReducer'
import { ToolStatus } from './GenericToolCard'

const STYLE: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-950/60 text-emerald-300',
  del: 'bg-red-950/60 text-red-300',
  ctx: 'text-neutral-500',
}
const SIGN: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ' }

export function DiffCard({ item, filePath, lines }: { item: ToolItem; filePath: string; lines: DiffLine[] }) {
  return (
    <details open className="rounded border border-neutral-800 text-xs" data-testid="diff-card">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
        <span className="font-medium text-neutral-300">{item.name}</span>
        <span className="truncate text-neutral-400">{filePath}</span>
        <span className="ml-auto">
          <ToolStatus item={item} />
        </span>
      </summary>
      <div className="max-h-96 overflow-auto border-t border-neutral-800 font-mono">
        {lines.map((line, i) => (
          <div key={i} data-kind={line.kind} className={`px-2 whitespace-pre ${STYLE[line.kind]}`}>
            {SIGN[line.kind]} {line.text}
          </div>
        ))}
      </div>
      {item.isError && item.output && <div className="border-t border-neutral-800 p-2 text-red-300">{item.output}</div>}
    </details>
  )
}
