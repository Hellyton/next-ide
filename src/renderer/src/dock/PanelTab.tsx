import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { useEffect, useState } from 'react'
import type { PanelParams } from '@shared/models'
import { projectColor } from '@shared/projectColor'
import { useSessions } from '../stores/sessionsStore'
import { useDock } from './dockStore'
import { stateDotClass } from './stateStyle'

export function PanelTab({ api, params }: IDockviewPanelHeaderProps<PanelParams>) {
  const state = useSessions((s) => s.byId[api.id]?.state)
  // `api.title` is not itself reactive: without this subscription an imperative
  // `.api.setTitle()` call (e.g. after /rename or /clear) would only show up once
  // something unrelated happens to re-render this tab.
  const [title, setTitle] = useState(api.title)
  useEffect(() => {
    setTitle(api.title)
    const disposable = api.onDidTitleChange((event) => setTitle(event.title))
    return () => disposable.dispose()
  }, [api])
  return (
    <div
      data-testid="panel-tab"
      className="flex h-full items-center gap-2 px-3 text-xs text-neutral-300"
      style={{ boxShadow: `inset 0 2px 0 ${projectColor(params.projectPath)}` }}
      onDoubleClick={() => (api.isMaximized() ? api.exitMaximized() : api.maximize())}
    >
      {state && <span className={stateDotClass(state)} />}
      <span className="max-w-48 truncate">{title}</span>
      <button
        aria-label={`Fechar ${title}`}
        className="rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        onClick={(e) => {
          e.stopPropagation()
          useDock.getState().requestClose(api.id)
        }}
      >
        ×
      </button>
    </div>
  )
}
