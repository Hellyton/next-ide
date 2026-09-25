import { useEffect, useRef, type KeyboardEvent } from 'react'

/**
 * Keyboard handling for the panel's modal dialogs: the dialog takes focus when it opens (so keys
 * stop reaching the composer underneath), Escape calls `onEscape`, and focus goes back to where it
 * was when the dialog closes. Spread the result on the element with role="dialog".
 */
export function useDialogKeys(onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    onEscape()
  }
  return { ref, tabIndex: -1, onKeyDown }
}
