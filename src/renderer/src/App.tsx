import { useCallback, useEffect, useState } from 'react'
import { subscribeAgentEvents } from './stores/agentStore'
import { subscribeDictationEvents } from './stores/dictationStore'
import { subscribeFileEvents } from './stores/filesStore'
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
    <div className="grid h-full bg-neutral-950 text-neutral-200" style={{ gridTemplateColumns: `${width}px auto 1fr` }}>
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
