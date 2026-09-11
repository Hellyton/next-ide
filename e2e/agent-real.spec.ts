import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test.skip(process.env.NEXT_IDE_REAL_AGENT !== '1', 'set NEXT_IDE_REAL_AGENT=1 to run against the real Claude')

test('Claude real responde pelo SDK', async () => {
  test.setTimeout(120_000)
  const folder = mkdtempSync(join(tmpdir(), 'proj-real-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder, NEXT_IDE_FAKE_AGENT: '0' } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('Responda apenas com a palavra: pong')
  await input.press('Enter')
  await expect(page.getByTestId('assistant-text').first()).toContainText(/pong/i, { timeout: 90_000 })
  const mode = page.getByRole('combobox', { name: 'Modo de permissão' })
  await mode.focus()
  await mode.selectOption('bypassPermissions')
  await expect(mode).toHaveValue('bypassPermissions')
  await page.waitForTimeout(1500)
  await expect(mode).toHaveValue('bypassPermissions')
  await app.close()
})
