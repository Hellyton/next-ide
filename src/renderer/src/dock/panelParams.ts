/**
 * dockview's `updateParameters` merges the given object into the panel's existing
 * params instead of replacing them; a key only gets removed when it is present in
 * the update with value `undefined`. This turns a `next` object into a patch that
 * actually replaces `current`: every key `current` had is set to `undefined` first
 * (so keys missing from `next` are cleared), then `next`'s own keys win.
 */
export function replacementPatch(current: Record<string, unknown> | undefined, next: Record<string, unknown>): Record<string, unknown> {
  const cleared: Record<string, unknown> = {}
  if (current) {
    for (const key of Object.keys(current)) cleared[key] = undefined
  }
  return { ...cleared, ...next }
}
