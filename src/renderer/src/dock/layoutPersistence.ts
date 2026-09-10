import type { DockviewApi, SerializedDockview } from 'dockview-react'

export async function restoreLayout(api: DockviewApi): Promise<void> {
  const state = await window.api.invoke('layout:get')
  if (!state) return
  try {
    api.fromJSON(state.dock as SerializedDockview)
  } catch (err) {
    console.error('[next-ide] layout restore failed', err)
    api.clear()
  }
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
