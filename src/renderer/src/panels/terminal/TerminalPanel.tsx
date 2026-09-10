import type { IDockviewPanelProps } from 'dockview-react'
import type { TerminalPanelParams } from '@shared/models'

export function TerminalPanel({ params }: IDockviewPanelProps<TerminalPanelParams>) {
  return <div className="p-4 text-sm text-neutral-500">Terminal em {params.projectPath}</div>
}
