import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef } from 'react'
import type { TerminalPanelParams } from '@shared/models'
import { attachTerminal } from './terminalRegistry'

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const entry = attachTerminal(api.id, params.projectPath, container)
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
      entry.host.remove()
    }
  }, [api, params.projectPath])

  return <div ref={ref} data-testid="terminal" className="h-full w-full overflow-hidden bg-[#0a0a0a] p-1" />
}
