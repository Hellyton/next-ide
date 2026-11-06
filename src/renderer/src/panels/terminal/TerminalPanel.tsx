import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import type { TerminalPanelParams } from '@shared/models'
import { replacementPatch } from '../../dock/panelParams'
import { useSessions } from '../../stores/sessionsStore'
import { attachTerminal, type TerminalEntry } from './terminalRegistry'
import { TerminalSearch } from './TerminalSearch'
import { withoutInitialCommand } from './terminalParams'
import { isModOnly } from '../../platform'

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const ref = useRef<HTMLDivElement>(null)
  const [entry, setEntry] = useState<TerminalEntry | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const state = useSessions((s) => s.byId[api.id]?.state)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const attached = attachTerminal(api.id, params.projectPath, container, params.initialCommand)
    setEntry(attached)
    // One-shot: strip it from the persisted params so a relaunch never replays it.
    // dockview's updateParameters merges into the existing params object, so an
    // omitted key is not enough to clear it — replacementPatch explicitly
    // undefines it, which dockview's merge treats as a delete.
    if (params.initialCommand) api.updateParameters(replacementPatch(params, withoutInitialCommand(params)))
    const observer = new ResizeObserver(() => attached.fit())
    observer.observe(container)
    attached.fit()
    const active = api.onDidActiveChange((e) => {
      if (!e.isActive) return
      attached.fit()
      attached.term.focus()
    })
    return () => {
      observer.disconnect()
      active.dispose()
      // A newer mount may already have re-adopted this terminal's host into its own
      // container (e.g. under StrictMode's double-invoke); only remove it if it is
      // still ours to remove.
      if (attached.host.parentElement === container) attached.host.remove()
    }
  }, [api, params.projectPath])

  return (
    <div
      className="relative h-full w-full"
      onKeyDownCapture={(e) => {
        if (isModOnly(e) && !e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          e.stopPropagation()
          setSearchOpen(true)
        }
      }}
    >
      <div ref={ref} data-testid="terminal" className="h-full w-full overflow-hidden p-1" />
      {searchOpen && entry && (
        <TerminalSearch
          entry={entry}
          onClose={() => {
            setSearchOpen(false)
            entry.term.focus()
          }}
        />
      )}
      {(state === 'exited' || state === 'error') && entry && (
        <button
          className="absolute right-4 bottom-4 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-100 shadow hover:bg-neutral-700"
          onClick={() => {
            entry.restart()
            entry.term.focus()
          }}
        >
          Reiniciar terminal
        </button>
      )}
    </div>
  )
}
