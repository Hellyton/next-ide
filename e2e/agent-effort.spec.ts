import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('seletor de esforço e /effort persistem no layout', async () => {
  const { app, page, userData } = await openAgent()
  const select = page.getByRole('combobox', { name: 'Esforço' })
  await expect(select).toHaveValue('')
  await select.selectOption('high')
  await expect(select).toHaveValue('high')

  // /clear tears down and re-creates the session: the CLI keeps the effort level across it.
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/clear')
  await input.press('Enter')
  await expect(select).toHaveValue('high')

  await input.fill('/effort max')
  await input.press('Enter')
  await expect(select).toHaveValue('max')

  await input.fill('/effort turbo')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Esforço inválido: turbo')

  await expect
    .poll(() => {
      try {
        return readFileSync(join(userData, 'layout.json'), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain('"effort": "max"')
  await app.close()
})
