import type { DockviewApi, SerializedDockview } from 'dockview-react'

export async function restoreLayout(api: DockviewApi, isCurrent: () => boolean): Promise<boolean> {
  const state = await window.api.invoke('layout:get')
  if (!isCurrent()) return false
  if (!state) return true
  try {
    api.fromJSON(state.dock as SerializedDockview)
  } catch (err) {
    console.error('[next-ide] layout restore failed', err)
    api.clear()
  }
  return true
}

export function attachLayoutPersistence(api: DockviewApi): () => void {
  const save = () => void window.api.invoke('layout:save', { version: 1, dock: api.toJSON() })
  const layout = api.onDidLayoutChange(save)
  const removed = api.onDidRemovePanel(save)
  return () => {
    layout.dispose()
    removed.dispose()
  }
}
