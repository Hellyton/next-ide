import * as pty from 'node-pty'
import type { SpawnFn } from './PtyManager'
import { shellEnv } from './shellEnv'

export const spawnShell: SpawnFn = (cwd, cols, rows) =>
  pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], {
    name: 'xterm-256color',
    cwd,
    cols,
    rows,
    env: shellEnv(process.env),
  })
