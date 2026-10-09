import { createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Sessions run by scripts through the Python SDK (review bots, hooks): noise in a /resume list. */
const AUTOMATED = new Set(['sdk-py'])
const ENTRYPOINT = /"entrypoint":"([^"]*)"/
/** The field sits after the first prompt, which can be a large pasted diff. */
const SCAN_LIMIT = 1024 * 1024

/** Where Claude Code keeps a project's transcripts (same folder naming as the CLI). */
export const transcriptDir = (cwd: string, env: NodeJS.ProcessEnv = process.env): string =>
  join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))

/** First `entrypoint` recorded in a transcript; null when the file is missing or carries none. */
export async function readEntrypoint(file: string): Promise<string | null> {
  let seen = ''
  try {
    for await (const chunk of createReadStream(file, { encoding: 'utf8', end: SCAN_LIMIT })) {
      // Keep a tail so a match split across two chunks is still found.
      seen = seen.slice(-64) + chunk
      const match = ENTRYPOINT.exec(seen)
      if (match) return match[1] ?? null
    }
  } catch {
    return null
  }
  return null
}

/** Drops script-run sessions; one whose origin can't be read stays listed. */
export async function dropAutomated<T extends { sessionId: string }>(cwd: string, sessions: T[], dir = transcriptDir(cwd)): Promise<T[]> {
  const origins = await Promise.all(sessions.map((s) => readEntrypoint(join(dir, `${s.sessionId}.jsonl`))))
  return sessions.filter((_, i) => !AUTOMATED.has(origins[i] ?? ''))
}
