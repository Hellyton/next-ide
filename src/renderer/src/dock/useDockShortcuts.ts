import { useEffect } from 'react'
import { useQuickOpen } from '../quickopen/quickOpenStore'
import { useDock } from './dockStore'
import { matchShortcut } from './shortcuts'

export function useDockShortcuts(): void {
  useEffect(() => {
    // Capture phase so shortcuts win over focused xterm/textarea handlers.
    const onKey = (e: KeyboardEvent) => {
      const cmd = matchShortcut(e)
      if (!cmd) return
      e.preventDefault()
      e.stopPropagation()
      const dock = useDock.getState()
      if (cmd.kind === 'split') dock.split(cmd.direction)
      else if (cmd.kind === 'close') dock.closeActive()
      else if (cmd.kind === 'quickOpen') useQuickOpen.getState().show()
      else dock.focusGroup(cmd.index)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
