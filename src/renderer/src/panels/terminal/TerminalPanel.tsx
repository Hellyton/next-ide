import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef } from 'react'
import type { TerminalPanelParams } from '@shared/models'
import { replacementPatch } from '../../dock/panelParams'
import { attachTerminal } from './terminalRegistry'
import { withoutInitialCommand } from './terminalParams'

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const entry = attachTerminal(api.id, params.projectPath, container, params.initialCommand)
    // One-shot: strip it from the persisted params so a relaunch never replays it.
    // dockview's updateParameters merges into the existing params object, so an
    // omitted key is not enough to clear it — replacementPatch explicitly
    // undefines it, which dockview's merge treats as a delete.
    if (params.initialCommand) api.updateParameters(replacementPatch(params, withoutInitialCommand(params)))
    const observer = new ResizeObserver(() => entry.fit())
    observer.observe(container)
    entry.fit()
    const active = api.onDidActiveChange((e) => {
      if (!e.isActive) return
      entry.fit()
      entry.term.focus()
    })
    return () => {
      observer.disconnect()
      active.dispose()
      // A newer mount may already have re-adopted this terminal's host into its own
      // container (e.g. under StrictMode's double-invoke); only remove it if it is
      // still ours to remove.
      if (entry.host.parentElement === container) entry.host.remove()
    }
  }, [api, params.projectPath])

  return <div ref={ref} data-testid="terminal" className="h-full w-full overflow-hidden bg-[#0a0a0a] p-1" />
}
