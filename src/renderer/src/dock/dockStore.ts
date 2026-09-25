import type { DockviewApi } from 'dockview-react'
import { create } from 'zustand'
import type { FilePanelParams, PanelParams } from '@shared/models'
import { useSessions } from '../stores/sessionsStore'
import { useFiles } from '../stores/filesStore'
import { CLOSE_CONFIRM_MESSAGE, needsCloseConfirm, UNSAVED_CONFIRM_MESSAGE } from './closeGuard'
import { buildAddPanelOptions, newPanelId } from './panelOptions'
import { replacementPatch } from './panelParams'

type DockState = {
  api: DockviewApi | null
  /** projectPath → id of the agent panel most recently active in that project. */
  lastAgent: Record<string, string>
  setApi(api: DockviewApi): void
  open(params: PanelParams): string | null
  openBeside(referencePanelId: string, params: PanelParams): string | null
  openFile(params: FilePanelParams): void
  noteActive(panelId: string): void
  split(direction: 'right' | 'below'): void
  requestClose(panelId: string): void
  closeActive(): void
  focus(panelId: string): void
  focusGroup(index: number): void
}

export const useDock = create<DockState>()((set, get) => ({
  api: null,
  lastAgent: {},
  setApi: (api) => set({ api }),
  open: (params) => {
    const api = get().api
    if (!api) return null
    const id = newPanelId(params.type)
    api.addPanel(buildAddPanelOptions(params, id, { kind: 'activeGroup', groupId: api.activeGroup?.id }))
    return id
  },
  openBeside: (referencePanelId, params) => {
    const api = get().api
    if (!api) return null
    if (!api.getPanel(referencePanelId)) return get().open(params)
    const id = newPanelId(params.type)
    api.addPanel(buildAddPanelOptions(params, id, { kind: 'split', referencePanelId, direction: 'right' }))
    return id
  },
  openFile: (params) => {
    const api = get().api
    if (!api) return
    const existing = api.panels.find((p) => {
      const q = p.params as PanelParams | undefined
      return q?.type === 'file' && q.filePath === params.filePath
    })
    if (!existing) {
      get().open(params)
      return
    }
    existing.api.updateParameters(replacementPatch(existing.params, params))
    existing.api.setActive()
  },
  noteActive: (panelId) => {
    const params = get().api?.getPanel(panelId)?.params as PanelParams | undefined
    if (params?.type === 'agent') set((s) => ({ lastAgent: { ...s.lastAgent, [params.projectPath]: panelId } }))
  },
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
    if (params?.type === 'file' && useFiles.getState().dirty[params.filePath] && !window.confirm(UNSAVED_CONFIRM_MESSAGE)) return
    panel.api.close()
  },
  closeActive: () => {
    const id = get().api?.activePanel?.id
    if (id) get().requestClose(id)
  },
  focus: (panelId) => get().api?.getPanel(panelId)?.api.setActive(),
  focusGroup: (index) => get().api?.groups[index]?.activePanel?.api.setActive(),
}))
