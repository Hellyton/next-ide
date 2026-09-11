import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const defaultShell = () => process.env.SHELL || '/bin/zsh'

/** Apps launched from Finder get a minimal PATH; a login shell knows the user's real one. */
export async function loginShellPath(shell: string = defaultShell()): Promise<string | null> {
  try {
    const { stdout } = await exec(shell, ['-lc', 'printf "%s" "$PATH"'], { timeout: 5000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export function mergePath(current: string | undefined, login: string | null): string {
  const parts = [...(login ?? '').split(':'), ...(current ?? '').split(':')].filter(Boolean)
  return [...new Set(parts)].join(':')
}

export type ClaudePathDeps = { exists(path: string): boolean; home: string; which(): Promise<string | null> }

const defaultDeps: ClaudePathDeps = {
  exists: existsSync,
  home: homedir(),
  which: async () => {
    try {
      const { stdout } = await exec(defaultShell(), ['-lc', 'command -v claude'], { timeout: 5000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  },
}

export async function resolveClaudePath(configured: string | undefined, deps: ClaudePathDeps = defaultDeps): Promise<string | undefined> {
  if (configured && deps.exists(configured)) return configured
  const local = join(deps.home, '.local/bin/claude')
  if (deps.exists(local)) return local
  return (await deps.which()) ?? undefined
}
