import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openAgent } from './helpers'

test('aprova permissão inline e troca modo e modelo', async () => {
  const { app, page, userData } = await openAgent()
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

  // New panels open in auto mode; Shift+Tab cycles like the CLI, /mode and /model set it directly.
  const mode = page.getByTestId('mode-indicator')
  await expect(mode).toContainText('auto mode on')
  await input.press('Shift+Tab')
  await expect(mode).toContainText('manual mode on')
  await input.press('Shift+Tab')
  await expect(mode).toContainText('accept edits on')
  await input.fill('/mode pl')
  await expect(page.getByRole('option', { name: /mode plan/ })).toBeVisible()
  await input.press('Enter')
  await expect(mode).toContainText('plan mode on')

  await input.fill('/model ')
  await expect(page.getByRole('option', { name: /Fake Haiku/ })).toBeVisible()
  await input.fill('/model fake-small')
  await input.press('Enter')
  await expect(page.getByTestId('status-line')).toContainText('fake-small')

  // The project remembers them: a new chat of the same project starts in plan with fake-small.
  await expect.poll(() => readFileSync(join(userData, 'settings.json'), 'utf8')).toContain('"model": "fake-small"')
  await page.getByRole('button', { name: /^Abrir Claude em / }).first().click()
  await expect(page.locator('[data-testid="agent-panel"]')).toHaveCount(2)
  await expect(page.locator('[data-testid="mode-indicator"]:visible')).toContainText('plan mode on')
  await expect(page.locator('[data-testid="status-line"]:visible')).toContainText('fake-small')
  await app.close()
})
