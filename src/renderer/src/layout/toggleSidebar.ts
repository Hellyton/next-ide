import { useSettings } from '../stores/settingsStore'

export function toggleSidebar(): void {
  const { settings, update } = useSettings.getState()
  update({ sidebarCollapsed: !settings.sidebarCollapsed })
}
