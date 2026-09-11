/**
 * Builds the environment a user-facing shell should see.
 *
 * Strips app-internal variables (NEXT_IDE_* config/test hooks and the Vite dev
 * server URL) that have no business leaking into an interactive shell the user
 * types into, and drops `undefined` values so the result is an honest
 * `Record<string, string>` (no blanket cast).
 *
 * Pure — does not import node-pty — so it can be unit tested without a native
 * dependency.
 */
export function shellEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue
    if (key.startsWith('NEXT_IDE_')) continue
    if (key === 'ELECTRON_RENDERER_URL') continue
    env[key] = value
  }
  env.TERM_PROGRAM = 'next-ide'
  return env
}
