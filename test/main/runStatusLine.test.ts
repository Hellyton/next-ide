import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runStatusLine } from '../../src/main/statusline/runStatusLine'

const input = {
  session_id: 's',
  cwd: '/p',
  model: { id: 'm', display_name: 'M' },
  workspace: { current_dir: '/p', project_dir: '/p' },
  cost: { total_cost_usd: 0, total_duration_ms: 0 },
}
const settings = (command: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-'))
  const path = join(dir, 'settings.json')
  writeFileSync(path, JSON.stringify({ statusLine: { type: 'command', command } }))
  return path
}

describe('runStatusLine', () => {
  it('runs the command with the JSON on stdin and returns trimmed stdout', async () => {
    const out = await runStatusLine(input, { settingsPath: settings('cat | grep -o "\\"display_name\\":\\"M\\""'), shell: '/bin/sh' })
    expect(out).toBe('"display_name":"M"')
  })
  it('returns null without a configured command, on failure and on timeout', async () => {
    expect(await runStatusLine(input, { settingsPath: '/nope/settings.json', shell: '/bin/sh' })).toBeNull()
    expect(await runStatusLine(input, { settingsPath: settings('exit 3'), shell: '/bin/sh' })).toBeNull()
    expect(await runStatusLine(input, { settingsPath: settings('sleep 5'), shell: '/bin/sh', timeoutMs: 200 })).toBeNull()
  })
  it('survives a command that exits without reading a large stdin', async () => {
    expect(
      await runStatusLine({ ...input, cwd: 'x'.repeat(2_000_000) } as never, { settingsPath: settings('exit 3'), shell: '/bin/sh' }),
    ).toBeNull()
  })
})
