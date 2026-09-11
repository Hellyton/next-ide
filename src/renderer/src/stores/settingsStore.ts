import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings } from '@shared/models'

type SettingsState = { settings: Settings; loaded: boolean; load(): Promise<void>; update(patch: Partial<Settings>): void }

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    if (get().loaded) return
    set({ settings: await window.api.invoke('settings:get'), loaded: true })
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void window.api.invoke('settings:save', settings).catch((err) => console.error('[next-ide] failed to save settings', err))
  },
}))
