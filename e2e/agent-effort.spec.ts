import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('/effort muda a statusline e persiste no layout', async () => {
  const { app, page, userData } = await openAgent()
  const status = page.getByTestId('status-line')
  await expect(status).toContainText('esforço auto')
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  // Bare /effort reopens the input with the argument menu.
  await input.fill('/effort')
  await input.press('Enter')
  await expect(input).toHaveValue('/effort ')
  await expect(page.getByRole('option', { name: /effort high/ })).toBeVisible()
  await input.fill('/effort high')
  await input.press('Enter')
  await expect(status).toContainText('esforço alto')

  // /clear tears down and re-creates the session: the CLI keeps the effort level across it.
  await input.fill('/clear')
  await input.press('Enter')
  await expect(status).toContainText('esforço alto')

  await input.fill('/effort max')
  await input.press('Enter')
  await expect(status).toContainText('esforço máximo')

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
