import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runStatusLine, withClaudeDefaults } from '../../src/main/statusline/runStatusLine'

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
  it('adds effort, thinking and output style from the Claude settings, like the CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sl-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ effortLevel: 'high', outputStyle: 'Explanatory', statusLine: { type: 'command', command: 'cat' } }))
    const out = JSON.parse((await runStatusLine(input, { settingsPath: path, shell: '/bin/sh' }))!)
    expect(out).toMatchObject({ effort: { level: 'high' }, thinking: { enabled: true }, output_style: { name: 'Explanatory' } })
  })
  it('keeps thinking off when the settings turn it off and never overrides provided fields', () => {
    expect(withClaudeDefaults(input, { alwaysThinkingEnabled: false }).thinking).toEqual({ enabled: false })
    expect(withClaudeDefaults({ ...input, effort: { level: 'low' } }, { effortLevel: 'high' }).effort).toEqual({ level: 'low' })
  })
  it('survives a command that exits without reading a large stdin', async () => {
    expect(
      await runStatusLine({ ...input, cwd: 'x'.repeat(2_000_000) } as never, { settingsPath: settings('exit 3'), shell: '/bin/sh' }),
    ).toBeNull()
  })
})
