export function MentionMenu({ items, activeIndex, onPick }: { items: string[]; activeIndex: number; onPick(rel: string): void }) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label="Arquivos" className="mb-1 max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 py-1 text-xs">
      {items.map((rel, i) => (
        <li
          key={rel}
          role="option"
          aria-selected={i === activeIndex}
          className={`cursor-pointer truncate px-3 py-1 text-neutral-200 ${i === activeIndex ? 'bg-neutral-800' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(rel)
          }}
        >
          @{rel}
        </li>
      ))}
    </ul>
  )
}
