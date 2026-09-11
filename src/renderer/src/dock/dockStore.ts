import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import type { FilePanelParams, PanelParams } from '@shared/models'
import { useSessions } from '../stores/sessionsStore'
import { CLOSE_CONFIRM_MESSAGE, needsCloseConfirm } from './closeGuard'
import { buildAddPanelOptions, newPanelId } from './panelOptions'

type DockState = {
  api: DockviewApi | null
  setApi(api: DockviewApi): void
  open(params: PanelParams): void
  openFile(params: FilePanelParams): void
  split(direction: 'right' | 'below'): void
  requestClose(panelId: string): void
  closeActive(): void
  focus(panelId: string): void
  focusGroup(index: number): void
}

export const useDock = create<DockState>()((set, get) => ({
  api: null,
  setApi: (api) => set({ api }),
  open: (params) => {
    const api = get().api
    if (!api) return
    api.addPanel(buildAddPanelOptions(params, newPanelId(params.type), { kind: 'activeGroup', groupId: api.activeGroup?.id }))
  },
  // TODO(task 5): focus an already-open panel for this file instead of always opening a new one.
  openFile: (params) => get().open(params),
  split: (direction) => {
    const api = get().api
    const active = api?.activePanel
    const params = active?.params as PanelParams | undefined
    if (!api || !active || !params) return
    const next: PanelParams = params.type === 'agent' ? { type: 'agent', projectPath: params.projectPath } : params
    api.addPanel(buildAddPanelOptions(next, newPanelId(next.type), { kind: 'split', referencePanelId: active.id, direction }))
  },
  requestClose: (panelId) => {
    const panel = get().api?.getPanel(panelId)
    if (!panel) return
    const params = panel.params as PanelParams | undefined
    const state = useSessions.getState().byId[panelId]?.state
    if (needsCloseConfirm(params?.type, state) && !window.confirm(CLOSE_CONFIRM_MESSAGE)) return
    panel.api.close()
  },
  closeActive: () => {
    const id = get().api?.activePanel?.id
    if (id) get().requestClose(id)
  },
  focus: (panelId) => get().api?.getPanel(panelId)?.api.setActive(),
  focusGroup: (index) => get().api?.groups[index]?.activePanel?.api.setActive(),
}))
