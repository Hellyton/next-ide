import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('statusline: script do usuário recebe o JSON completo e vira a barra inteira', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-settings-'))
  const settingsPath = join(dir, 'settings.json')
  const dump = join(dir, 'statusline-input.json')
  writeFileSync(
    settingsPath,
    JSON.stringify({ effortLevel: 'high', statusLine: { type: 'command', command: `cat > '${dump}'; printf '\\033[32mSCRIPT OK\\033[0m'` } }),
  )
  const { app, page } = await openAgent({ env: { NEXT_IDE_CLAUDE_SETTINGS: settingsPath } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('oi')
  await input.press('Enter')
  const bar = page.getByTestId('status-line')
  await expect(bar).toContainText('fake-model')
  // No cost and no idle/running state in the built-in segments.
  await expect(bar).not.toContainText('$')
  await expect(bar).not.toContainText('ocioso')

  await input.fill('/statusline')
  await input.press('Enter')
  const config = page.getByRole('dialog', { name: 'Configurar statusline' })
  await expect(config.getByRole('checkbox', { name: 'custo' })).toHaveCount(0)
  await config.getByRole('checkbox', { name: 'script do ~/.claude (statusLine)' }).check()
  await config.getByRole('button', { name: 'Fechar' }).click()
  await expect(bar.getByText('SCRIPT OK')).toHaveCSS('color', 'rgb(74, 222, 128)')
  await expect(bar).not.toContainText('fake-model')

  await expect.poll(() => existsSync(dump)).toBe(true)
  expect(JSON.parse(readFileSync(dump, 'utf8'))).toMatchObject({
    version: '9.9.9-fake',
    effort: { level: 'high' },
    thinking: { enabled: true },
    context_window: { context_window_size: 200000, total_input_tokens: 10 },
    cost: { total_lines_added: 0, total_lines_removed: 0 },
    rate_limits: { five_hour: { used_percentage: 42, resets_at: 4_102_444_800 } },
  })
  await app.close()
})
