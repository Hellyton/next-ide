import { basename } from '@shared/workspaces'

export function DirsBar({ dirs, onRemove }: { dirs: string[]; onRemove(dir: string): void }) {
  if (dirs.length === 0) return null
  return (
    <div data-testid="dirs-bar" className="mx-2 mb-1 flex flex-wrap gap-1 text-xs">
      {dirs.map((dir) => (
        <span key={dir} title={dir} className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300">
          +{basename(dir)}
          <button aria-label={`Remover pasta ${basename(dir)}`} className="text-neutral-500 hover:text-neutral-200" onClick={() => onRemove(dir)}>
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
