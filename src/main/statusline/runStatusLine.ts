import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { StatusLineInput } from '@shared/agent'

type ClaudeSettings = {
  statusLine?: { type?: string; command?: string }
  effortLevel?: unknown
  alwaysThinkingEnabled?: unknown
  outputStyle?: unknown
}

async function readSettings(settingsPath: string): Promise<ClaudeSettings | null> {
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeSettings
  } catch {
    return null
  }
}

/** Fills the fields the CLI takes from the user's Claude settings (effort, thinking, output style). */
export function withClaudeDefaults(input: StatusLineInput, settings: ClaudeSettings): StatusLineInput {
  return {
    ...input,
    ...(!input.effort && typeof settings.effortLevel === 'string' ? { effort: { level: settings.effortLevel } } : {}),
    // Claude Code thinks by default on models that support it; the setting only turns it off.
    ...(!input.thinking ? { thinking: { enabled: settings.alwaysThinkingEnabled !== false } } : {}),
    ...(!input.output_style && typeof settings.outputStyle === 'string' ? { output_style: { name: settings.outputStyle } } : {}),
  }
}

/** Runs the user's Claude Code statusLine command with next-ide's JSON on stdin (same contract as the CLI). */
export async function runStatusLine(
  input: StatusLineInput,
  opts: { settingsPath?: string; shell?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const settings = await readSettings(opts.settingsPath ?? join(homedir(), '.claude', 'settings.json'))
  const command = settings?.statusLine?.type === 'command' && settings.statusLine.command ? settings.statusLine.command : null
  if (!settings || !command) return null
  const payload = withClaudeDefaults(input, settings)
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
    // The command may exit before reading stdin (or without reading it at all); the child's own
    // 'close' handler above already resolves the promise, so just swallow the resulting EPIPE.
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(payload))
  })
}
