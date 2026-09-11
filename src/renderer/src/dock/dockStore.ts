import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import type { PanelParams } from '@shared/models'
import { buildAddPanelOptions, newPanelId } from './panelOptions'

type DockState = {
  api: DockviewApi | null
  setApi(api: DockviewApi): void
  open(params: PanelParams): void
  split(direction: 'right' | 'below'): void
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
  split: (direction) => {
    const api = get().api
    const active = api?.activePanel
    const params = active?.params as PanelParams | undefined
    if (!api || !active || !params) return
    const next: PanelParams = params.type === 'agent' ? { type: 'agent', projectPath: params.projectPath } : params
    api.addPanel(buildAddPanelOptions(next, newPanelId(next.type), { kind: 'split', referencePanelId: active.id, direction }))
  },
  closeActive: () => get().api?.activePanel?.api.close(),
  focus: (panelId) => get().api?.getPanel(panelId)?.api.setActive(),
  focusGroup: (index) => get().api?.groups[index]?.activePanel?.api.setActive(),
}))
