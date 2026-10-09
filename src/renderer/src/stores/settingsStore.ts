import { create } from 'zustand'
import { DEFAULT_SETTINGS, mergeProjectDefaults, type EffortLevel, type PermissionMode, type Settings } from '@shared/models'

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

/** A model/effort/mode picked in a chat becomes that project's default for new chats. */
export function rememberProjectDefault(projectPath: string, patch: { model?: string; effort?: EffortLevel | null; permissionMode?: PermissionMode }): void {
  // Load first: saving the not-yet-loaded defaults would overwrite the user's settings file.
  void useSettings
    .getState()
    .load()
    .then(() => {
      const { settings, update } = useSettings.getState()
      const all = settings.projectDefaults ?? {}
      update({ projectDefaults: { ...all, [projectPath]: mergeProjectDefaults(all[projectPath], patch) } })
    })
    .catch((err) => console.error('[next-ide] failed to save project defaults', err))
}
