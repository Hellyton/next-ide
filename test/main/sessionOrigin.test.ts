import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dropAutomated, readEntrypoint, transcriptDir } from '../../src/main/agent/sessionOrigin'

const line = (entrypoint: string, content = 'oi') => `${JSON.stringify({ type: 'user', message: { role: 'user', content }, entrypoint })}\n`

describe('sessionOrigin', () => {
  it('names the transcript folder like the CLI does', () => {
    expect(transcriptDir('/Users/me/my.app', { CLAUDE_CONFIG_DIR: '/cfg' })).toBe('/cfg/projects/-Users-me-my-app')
  })

  it('reads the entrypoint even after a large first prompt, ignoring one quoted inside it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'origin-'))
    const file = join(dir, 'a.jsonl')
    await writeFile(file, line('cli', `"entrypoint":"sdk-py" ${'x'.repeat(200_000)}`))
    expect(await readEntrypoint(file)).toBe('cli')
    expect(await readEntrypoint(join(dir, 'missing.jsonl'))).toBeNull()
  })

  it('drops sdk-py sessions and keeps the rest, including unreadable ones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'origin-'))
    await writeFile(join(dir, 'bot.jsonl'), line('sdk-py'))
    await writeFile(join(dir, 'ide.jsonl'), line('sdk-ts'))
    await writeFile(join(dir, 'cli.jsonl'), line('cli'))
    const sessions = ['bot', 'ide', 'cli', 'gone'].map((sessionId) => ({ sessionId }))
    expect((await dropAutomated('/p', sessions, dir)).map((s) => s.sessionId)).toEqual(['ide', 'cli', 'gone'])
  })
})
