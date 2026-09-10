import { Dock } from './dock/Dock'

export function App() {
  return (
    <div className="grid h-full grid-cols-[280px_1fr] bg-neutral-950 text-neutral-200">
      <aside className="overflow-y-auto border-r border-neutral-800" data-testid="sidebar" />
      <main className="min-w-0">
        <Dock />
      </main>
    </div>
  )
}
