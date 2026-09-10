import type { LayoutState } from './models'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function sanitizeLayout(value: unknown): LayoutState | null {
  if (!isObject(value) || value.version !== 1 || !isObject(value.dock)) return null
  if (!isObject(value.dock.grid) || !isObject(value.dock.panels)) return null
  return { version: 1, dock: value.dock }
}
