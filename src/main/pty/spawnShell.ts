import * as pty from 'node-pty'
import type { SpawnFn } from './PtyManager'
import { shellEnv } from './shellEnv'

/** The user's interactive shell: their login shell on macOS/Linux, PowerShell on Windows. */
export function userShell(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): { file: string; args: string[] } {
  if (platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] }
  return { file: env.SHELL || '/bin/zsh', args: ['-l'] }
}

export const spawnShell: SpawnFn = (cwd, cols, rows) => {
  const { file, args } = userShell()
  return pty.spawn(file, args, {
    name: 'xterm-256color',
    cwd,
    cols,
    rows,
    env: shellEnv(process.env),
  })
}
