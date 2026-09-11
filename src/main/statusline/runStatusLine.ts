import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { StatusLineInput } from '@shared/agent'

async function readCommand(settingsPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath, 'utf8')) as { statusLine?: { type?: string; command?: string } }
    return parsed.statusLine?.type === 'command' && parsed.statusLine.command ? parsed.statusLine.command : null
  } catch {
    return null
  }
}

/** Runs the user's Claude Code statusLine command with next-ide's JSON on stdin (same contract as the CLI). */
export async function runStatusLine(
  input: StatusLineInput,
  opts: { settingsPath?: string; shell?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const command = await readCommand(opts.settingsPath ?? join(homedir(), '.claude', 'settings.json'))
  if (!command) return null
  return new Promise((resolve) => {
    const child = spawn(opts.shell ?? (process.env.SHELL || '/bin/zsh'), ['-lc', command], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, opts.timeoutMs ?? 2000)
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? out.replace(/\s+$/, '') || null : null)
    })
    child.stdin.end(JSON.stringify(input))
  })
}
