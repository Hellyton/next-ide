import { useEffect, useState } from 'react'
import type { TerminalEntry } from './terminalRegistry'

const OPTIONS = {
  decorations: {
    matchBackground: '#525252',
    matchOverviewRuler: '#a3a3a3',
    activeMatchBackground: '#c2410c',
    activeMatchColorOverviewRuler: '#fb923c',
  },
}

export function TerminalSearch({ entry, onClose }: { entry: TerminalEntry; onClose(): void }) {
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<{ index: number; count: number } | null>(null)

  useEffect(() => {
    const sub = entry.search.onDidChangeResults((e) => setResult({ index: e.resultIndex, count: e.resultCount }))
    return () => {
      sub.dispose()
      entry.search.clearDecorations()
    }
  }, [entry])

  const find = (value: string, backwards = false) => {
    if (!value) {
      entry.search.clearDecorations()
      setResult(null)
      return
    }
    if (backwards) entry.search.findPrevious(value, OPTIONS)
    else entry.search.findNext(value, OPTIONS)
  }

  const label = !result ? '' : result.count === 0 ? 'sem resultados' : result.index < 0 ? `${result.count}+` : `${result.index + 1}/${result.count}`

  return (
    <div className="absolute top-2 right-4 z-10 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs shadow-lg">
      <input
        autoFocus
        aria-label="Buscar no terminal"
        className="w-48 bg-transparent text-neutral-100 outline-none"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          find(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            find(term, e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span data-testid="terminal-search-count" className="min-w-16 text-neutral-400">
        {label}
      </span>
      <button aria-label="Fechar busca" className="text-neutral-500 hover:text-neutral-200" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
