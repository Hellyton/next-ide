import type { IDockviewPanelHeaderProps } from 'dockview-react'
import type { PanelParams } from '@shared/models'
import { projectColor } from '@shared/projectColor'
import { useSessions } from '../stores/sessionsStore'
import { stateDotClass } from './stateStyle'

export function PanelTab({ api, params }: IDockviewPanelHeaderProps<PanelParams>) {
  const state = useSessions((s) => s.byId[api.id]?.state)
  return (
    <div
      data-testid="panel-tab"
      className="flex h-full items-center gap-2 px-3 text-xs text-neutral-300"
      style={{ boxShadow: `inset 0 2px 0 ${projectColor(params.projectPath)}` }}
      onDoubleClick={() => (api.isMaximized() ? api.exitMaximized() : api.maximize())}
    >
      {state && <span className={stateDotClass(state)} />}
      <span className="max-w-48 truncate">{api.title}</span>
      <button
        aria-label={`Fechar ${api.title}`}
        className="rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        onClick={(e) => {
          e.stopPropagation()
          api.close()
        }}
      >
        ×
      </button>
    </div>
  )
}
