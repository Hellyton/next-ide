import { useEffect } from 'react'
import { subscribeAgentEvents } from './stores/agentStore'
import { subscribeFileEvents } from './stores/filesStore'
import { Dock } from './dock/Dock'
import { useDockShortcuts } from './dock/useDockShortcuts'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  useDockShortcuts()
  useEffect(() => subscribeAgentEvents(), [])
  useEffect(() => subscribeFileEvents(), [])
  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-neutral-950 text-neutral-200">
      <aside className="overflow-hidden border-r border-neutral-800" data-testid="sidebar">
        <Sidebar />
      </aside>
      <main className="min-w-0">
        <Dock />
      </main>
    </div>
  )
}
