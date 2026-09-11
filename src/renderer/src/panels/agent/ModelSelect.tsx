import { useState } from 'react'
import type { ModelOption } from '@shared/agent'

export function ModelSelect({ panelId, model }: { panelId: string; model: string | undefined }) {
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  const load = () => {
    if (options) return
    void window.api
      .invoke('agent:models', panelId)
      .then(setOptions)
      .catch((err) => console.error('[next-ide] models failed', err))
  }
  const list = options ?? []
  const current = model ?? ''
  return (
    <select
      id={`model-select-${panelId}`}
      aria-label="Modelo"
      className="max-w-40 rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={current}
      onFocus={load}
      onChange={(e) => void window.api.invoke('agent:setModel', panelId, e.target.value).catch((err) => console.error('[next-ide] setModel failed', err))}
    >
      {!list.some((o) => o.value === current) && <option value={current}>{current || 'modelo padrão'}</option>}
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.displayName}
        </option>
      ))}
    </select>
  )
}
