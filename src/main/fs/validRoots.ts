import { isAbsolute } from 'node:path'

/**
 * Keeps only entries the main-process file guard should ever treat as workspace roots:
 * absolute string paths. Filters out malformed entries coming from the renderer's saved
 * workspaces or from an agent-driven edit of that state.
 */
export function validRoots(paths: unknown[]): string[] {
  return paths.filter((p): p is string => typeof p === 'string' && isAbsolute(p))
}
