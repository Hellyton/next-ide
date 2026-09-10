import {
  DockviewReact,
  themeDark,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { useCallback, type FunctionComponent } from 'react'
import type { PanelParams } from '@shared/models'
import { AgentStubPanel } from '../panels/agent/AgentStubPanel'
import { TerminalPanel } from '../panels/terminal/TerminalPanel'
import { disposeTerminal } from '../panels/terminal/terminalRegistry'
import { useSessions } from '../stores/sessionsStore'
import { useDock } from './dockStore'
import { attachLayoutPersistence, restoreLayout } from './layoutPersistence'
import { PanelTab } from './PanelTab'
import { panelTitle } from './panelOptions'

const components = {
  agent: AgentStubPanel,
  terminal: TerminalPanel,
} as unknown as Record<string, FunctionComponent<IDockviewPanelProps>>

type RemovedListener = (panelId: string, params: PanelParams | undefined) => void
const removedListeners: RemovedListener[] = []
export function registerPanelRemovedListener(fn: RemovedListener): void {
  removedListeners.push(fn)
}

registerPanelRemovedListener((panelId, params) => {
  if (params?.type === 'terminal') disposeTerminal(panelId)
})

function Watermark() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-600">
      Abra um projeto na barra lateral: ▶ Claude · ⌨ Terminal
    </div>
  )
}

export function Dock() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api
    useDock.getState().setApi(api)
    api.onDidAddPanel((panel) => {
      const params = panel.params as PanelParams | undefined
      if (!params || params.type === 'file') return
      useSessions.getState().add({
        panelId: panel.id,
        type: params.type,
        projectPath: params.projectPath,
        title: panelTitle(params),
        state: 'idle',
      })
    })
    api.onDidRemovePanel((panel) => {
      useSessions.getState().remove(panel.id)
      for (const fn of removedListeners) fn(panel.id, panel.params as PanelParams | undefined)
    })
    void restoreLayout(api).then(() => attachLayoutPersistence(api))
  }, [])

  return (
    <DockviewReact
      className="h-full"
      theme={themeDark}
      components={components}
      defaultTabComponent={PanelTab as FunctionComponent<any>}
      watermarkComponent={Watermark}
      onReady={onReady}
    />
  )
}
