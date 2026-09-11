import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('statusline mostra modelo, custo e script do usuário', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-settings-'))
  const settingsPath = join(dir, 'settings.json')
  writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: "printf '\\033[32mSCRIPT OK\\033[0m'" } }))
  const { app, page } = await openAgent({ env: { NEXT_IDE_CLAUDE_SETTINGS: settingsPath } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('oi')
  await input.press('Enter')
  const bar = page.getByTestId('status-line')
  await expect(bar).toContainText('fake-model')
  await expect(bar).toContainText('$0.01')

  await input.fill('/statusline')
  await input.press('Enter')
  const config = page.getByRole('dialog', { name: 'Configurar statusline' })
  await config.getByRole('checkbox', { name: 'custo' }).uncheck()
  await config.getByRole('checkbox', { name: 'script do ~/.claude (statusLine)' }).check()
  await config.getByRole('button', { name: 'Fechar' }).click()
  await expect(bar).not.toContainText('$0.01')
  await expect(bar.getByText('SCRIPT OK')).toHaveCSS('color', 'rgb(74, 222, 128)')
  await app.close()
})
