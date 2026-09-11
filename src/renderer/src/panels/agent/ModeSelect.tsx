import type { PermissionMode } from '@shared/models'
import { MODE_OPTIONS } from '../../agent/permissions'

export function ModeSelect({ panelId, mode }: { panelId: string; mode: PermissionMode | undefined }) {
  return (
    <select
      aria-label="Modo de permissão"
      className="rounded bg-neutral-900 px-1 py-0.5 text-neutral-300 ring-1 ring-neutral-800"
      value={mode ?? 'default'}
      onChange={(e) =>
        void window.api.invoke('agent:setMode', panelId, e.target.value as PermissionMode).catch((err) => console.error('[next-ide] setMode failed', err))
      }
    >
      {MODE_OPTIONS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
