export const PROJECT_PALETTE = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#f43f5e',
] as const

/** FNV-1a hash of the path mapped onto the palette. */
export function projectColor(path: string): string {
  let hash = 2166136261
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return PROJECT_PALETTE[(hash >>> 0) % PROJECT_PALETTE.length]!
}
