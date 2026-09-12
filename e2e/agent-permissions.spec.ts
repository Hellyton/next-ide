import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('aprova permissão inline e troca modo e modelo', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('teste de permissão')
  await input.press('Enter')

  const card = page.getByTestId('permission-card')
  await expect(card).toContainText('Bash')
  await expect(card).toContainText('rm -rf dist')
  await expect(page.getByTestId('active-sessions')).toBeVisible()
  await card.getByRole('button', { name: 'Permitir', exact: true }).click()
  await expect(card).toContainText('Permitido')
  await expect(page.getByTestId('bash-card')).toContainText('removido')

  // New panels open in auto mode.
  await expect(page.getByRole('combobox', { name: 'Modo de permissão' })).toHaveValue('auto')
  await page.getByRole('combobox', { name: 'Modo de permissão' }).selectOption('plan')
  await expect(page.getByRole('combobox', { name: 'Modo de permissão' })).toHaveValue('plan')

  const model = page.getByRole('combobox', { name: 'Modelo' })
  // Focus (not click): a click opens the native popup, which can swallow the options update.
  await model.focus()
  await expect(model.locator('option', { hasText: 'Fake Haiku' })).toHaveCount(1)
  await model.selectOption('fake-small')
  await expect(model).toHaveValue('fake-small')
  await app.close()
})
