import { useCallback, useEffect, useState } from 'react'
import { subscribeAgentEvents } from './stores/agentStore'
import { subscribeDictationEvents } from './stores/dictationStore'
import { subscribeFileEvents } from './stores/filesStore'
import { clampTransparency } from '@shared/models'
import { useSettings } from './stores/settingsStore'
import { Dock } from './dock/Dock'
import { useDockShortcuts } from './dock/useDockShortcuts'
import { SidebarResizer } from './layout/SidebarResizer'
import { clampSidebarWidth, DEFAULT_SIDEBAR } from './layout/sidebarWidth'
import { QuickOpen } from './quickopen/QuickOpen'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  useDockShortcuts()
  const storedWidth = useSettings((s) => s.settings.sidebarWidth)
  const [width, setWidth] = useState(DEFAULT_SIDEBAR)
  const transparency = useSettings((s) => s.settings.windowTransparency)
  useEffect(() => {
    const apply = (percent: number) => document.documentElement.style.setProperty('--surface-alpha', String(1 - clampTransparency(percent) / 100))
    apply(transparency ?? 0)
    return window.api.on('window:transparency', apply)
  }, [transparency])
  useEffect(() => subscribeAgentEvents(), [])
  useEffect(() => subscribeDictationEvents(), [])
  useEffect(() => subscribeFileEvents(), [])
  useEffect(() => void useSettings.getState().load(), [])
  // Adopt the saved width once the settings arrive (and whenever another panel changes it).
  useEffect(() => {
    if (storedWidth) setWidth(clampSidebarWidth(storedWidth, window.innerWidth))
  }, [storedWidth])

  const commit = useCallback((next: number) => useSettings.getState().update({ sidebarWidth: next }), [])

  return (
    <div className="app-surface grid h-full text-neutral-200" style={{ gridTemplateColumns: `${width}px auto 1fr` }}>
      <aside className="overflow-hidden" data-testid="sidebar">
        <Sidebar />
      </aside>
      <SidebarResizer width={width} onResize={setWidth} onCommit={commit} />
      <main className="min-w-0">
        <Dock />
      </main>
      <QuickOpen />
    </div>
  )
}
