import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export function isInside(target: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  if (rel === '') return true
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)
}

/** Resolves symlinks on both sides so a link inside a project can't point outside it. */
export async function resolveInsideRoots(target: string, roots: string[]): Promise<string | null> {
  if (!isAbsolute(target)) return null
  let real: string
  try {
    real = await realpath(target)
  } catch {
    return null
  }
  for (const root of roots) {
    try {
      if (isInside(real, await realpath(root))) return real
    } catch {
      // root no longer exists — skip it
    }
  }
  return null
}
