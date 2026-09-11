import type { SlashItem } from '../../agent/slash'

export function SlashMenu({ items, activeIndex, onPick }: { items: SlashItem[]; activeIndex: number; onPick(item: SlashItem): void }) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label="Comandos" className="mb-1 max-h-60 overflow-auto rounded border border-neutral-800 bg-neutral-900 py-1 text-xs">
      {items.map((item, i) => (
        <li
          key={item.name}
          role="option"
          aria-selected={i === activeIndex}
          className={`flex cursor-pointer gap-2 px-3 py-1 ${i === activeIndex ? 'bg-neutral-800' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
        >
          <span className="text-neutral-100">/{item.name}</span>
          {item.argumentHint && <span className="text-neutral-500">{item.argumentHint}</span>}
          <span className="truncate text-neutral-500">{item.description}</span>
          {item.local && <span className="ml-auto text-neutral-600">ide</span>}
        </li>
      ))}
    </ul>
  )
}
