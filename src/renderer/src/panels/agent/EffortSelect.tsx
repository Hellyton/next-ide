import { EFFORT_LEVELS, type EffortLevel } from '@shared/models'
import { useAgents } from '../../stores/agentStore'

const LABEL: Record<EffortLevel, string> = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo' }
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function EffortSelect({ panelId, effort }: { panelId: string; effort: EffortLevel | null | undefined }) {
  return (
    <select
      id={`effort-select-${panelId}`}
      aria-label="Esforço"
      className="rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={effort ?? ''}
      onChange={(e) => {
        const value = e.target.value
        void window.api
          .invoke('agent:setEffort', panelId, value ? (value as EffortLevel) : null)
          .catch((err) => useAgents.getState().setNotice(panelId, { text: errorText(err), command: '' }))
      }}
    >
      <option value="">esforço auto</option>
      {EFFORT_LEVELS.map((level) => (
        <option key={level} value={level}>
          esforço {LABEL[level]}
        </option>
      ))}
    </select>
  )
}
