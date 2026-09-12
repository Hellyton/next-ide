import { useEffect, useRef } from 'react'
import { clampSidebarWidth, DEFAULT_SIDEBAR, MAX_SIDEBAR, MIN_SIDEBAR } from './sidebarWidth'

type Props = { width: number; onResize(width: number): void; onCommit(width: number): void }

/** Drag handle between the sidebar and the dock (also arrow-key resizable, double-click resets). */
export function SidebarResizer({ width, onResize, onCommit }: Props) {
  const dragging = useRef(false)
  const latest = useRef(width)
  latest.current = width

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      onResize(clampSidebarWidth(e.clientX, window.innerWidth))
    }
    const stop = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      onCommit(latest.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [onResize, onCommit])

  const set = (next: number) => {
    const clamped = clampSidebarWidth(next, window.innerWidth)
    onResize(clamped)
    onCommit(clamped)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      aria-valuenow={width}
      aria-valuemin={MIN_SIDEBAR}
      aria-valuemax={MAX_SIDEBAR}
      tabIndex={0}
      data-testid="sidebar-resizer"
      className="w-1 cursor-col-resize bg-neutral-800 transition-colors hover:bg-orange-600/70 focus:bg-orange-600/70 focus:outline-none"
      onPointerDown={(e) => {
        e.preventDefault()
        dragging.current = true
        document.body.style.cursor = 'col-resize'
      }}
      onDoubleClick={() => set(DEFAULT_SIDEBAR)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') set(latest.current - 16)
        else if (e.key === 'ArrowRight') set(latest.current + 16)
        else return
        e.preventDefault()
      }}
    />
  )
}
