import {
  DockviewReact,
  themeDark,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { useCallback, type FunctionComponent } from 'react'
import type { PanelParams } from '@shared/models'
import { AgentPanel } from '../panels/agent/AgentPanel'
import { FilePanel } from '../panels/file/FilePanel'
import { TerminalPanel } from '../panels/terminal/TerminalPanel'
import { disposeTerminal } from '../panels/terminal/terminalRegistry'
import { useAgents } from '../stores/agentStore'
import { useSessions } from '../stores/sessionsStore'
import { useDock } from './dockStore'
import { attachLayoutPersistence, restoreLayout } from './layoutPersistence'
import { PanelTab } from './PanelTab'
import { panelTitle } from './panelOptions'

const components = {
  agent: AgentPanel,
  terminal: TerminalPanel,
  file: FilePanel,
} as unknown as Record<string, FunctionComponent<IDockviewPanelProps>>

type RemovedListener = (panelId: string, params: PanelParams | undefined) => void
const removedListeners: RemovedListener[] = []
export function registerPanelRemovedListener(fn: RemovedListener): void {
  removedListeners.push(fn)
}

registerPanelRemovedListener((panelId, params) => {
  if (params?.type === 'terminal') disposeTerminal(panelId)
})

registerPanelRemovedListener((panelId, params) => {
  if (params?.type !== 'agent') return
  useAgents.getState().remove(panelId)
  void window.api.invoke('agent:close', panelId).catch((err) => console.error('[next-ide] agent close failed', err))
  useDock.setState((s) => ({ lastAgent: Object.fromEntries(Object.entries(s.lastAgent).filter(([, id]) => id !== panelId)) }))
})

// Survives StrictMode's double-invoke of onReady: only the persistence listeners attached
// for the api that is still current get to keep running.
let detachPersistence: (() => void) | null = null

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
    api.onDidActivePanelChange(({ panel }) => {
      if (panel) useDock.getState().noteActive(panel.id)
    })
    const isCurrent = () => useDock.getState().api === api
    void restoreLayout(api, isCurrent).then((ok) => {
      if (!ok || !isCurrent()) return
      detachPersistence?.()
      detachPersistence = attachLayoutPersistence(api)
    })
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
