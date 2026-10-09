import type { PermissionMode } from '@shared/models'
import { modeOption } from '../../agent/permissions'

/** The CLI's "⏵⏵ accept edits on (shift+tab to cycle)" line; clicking also cycles. */
export function ModeIndicator({ mode, onCycle }: { mode: PermissionMode | undefined; onCycle(): void }) {
  const option = modeOption(mode)
  return (
    <button data-testid="mode-indicator" title="Shift+Tab alterna o modo" className="whitespace-nowrap rounded px-1 hover:bg-neutral-800" onClick={onCycle}>
      <span style={{ color: option.color }}>
        {option.icon && `${option.icon} `}
        {option.label}
      </span>
      <span className="ml-1 text-neutral-600">(shift+tab para alternar)</span>
    </button>
  )
}
