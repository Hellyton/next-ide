import type { IDockviewPanelProps } from 'dockview-react'
import type { AgentPanelParams } from '@shared/models'

export function AgentStubPanel({ params }: IDockviewPanelProps<AgentPanelParams>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-500">
      <span>Painel de agente — chega no Plano 2</span>
      <code className="text-xs text-neutral-600">{params.projectPath}</code>
    </div>
  )
}
