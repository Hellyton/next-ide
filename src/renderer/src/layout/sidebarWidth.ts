export const MIN_SIDEBAR = 200
export const MAX_SIDEBAR = 720
export const DEFAULT_SIDEBAR = 280

/** Keeps the sidebar usable: never thinner than the filter box, never past 60% of the window. */
export function clampSidebarWidth(px: number, windowWidth = 1600): number {
  if (!Number.isFinite(px)) return DEFAULT_SIDEBAR
  const max = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, Math.round(windowWidth * 0.6)))
  return Math.round(Math.min(Math.max(px, MIN_SIDEBAR), max))
}
