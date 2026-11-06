import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter as pathDelimiter, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const isWindows = process.platform === 'win32'
const defaultShell = () => process.env.SHELL || '/bin/zsh'

/** Apps launched from Finder get a minimal PATH; a login shell knows the user's real one. */
export async function loginShellPath(shell: string = defaultShell()): Promise<string | null> {
  // Windows apps inherit the user's full PATH from Explorer; there is no login shell to ask.
  if (isWindows) return null
  try {
    const { stdout } = await exec(shell, ['-lc', 'printf "%s" "$PATH"'], { timeout: 5000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export function mergePath(current: string | undefined, login: string | null, delimiter: string = pathDelimiter): string {
  const parts = [...(login ?? '').split(delimiter), ...(current ?? '').split(delimiter)].filter(Boolean)
  return [...new Set(parts)].join(delimiter)
}

export type ClaudePathDeps = { exists(path: string): boolean; home: string; which(): Promise<string | null>; platform?: NodeJS.Platform }

const defaultDeps: ClaudePathDeps = {
  exists: existsSync,
  home: homedir(),
  platform: process.platform,
  which: async () => {
    try {
      if (isWindows) {
        // `where` prints every match; npm installs a claude.cmd shim next to the real exe, prefer the .exe.
        const { stdout } = await exec('where.exe', ['claude'], { timeout: 5000, windowsHide: true })
        const hits = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        return hits.find((h) => h.toLowerCase().endsWith('.exe')) ?? null
      }
      const { stdout } = await exec(defaultShell(), ['-lc', 'command -v claude'], { timeout: 5000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  },
}

export async function resolveClaudePath(configured: string | undefined, deps: ClaudePathDeps = defaultDeps): Promise<string | undefined> {
  if (configured && deps.exists(configured)) return configured
  const local = join(deps.home, deps.platform === 'win32' ? '.local/bin/claude.exe' : '.local/bin/claude')
  if (deps.exists(local)) return local
  return (await deps.which()) ?? undefined
}
