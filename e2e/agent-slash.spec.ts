import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('autocomplete de /, /resume, /clear e aviso de comando da TUI', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/')
  const menu = page.getByRole('listbox', { name: 'Comandos' })
  await expect(menu).toContainText('resume')
  await expect(menu).toContainText('compact')
  await input.fill('/comp')
  await input.press('Tab')
  await expect(input).toHaveValue('/compact ')

  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('pergunta antiga')
  await expect(page.getByTestId('chat-view')).toContainText('resposta antiga')

  await input.fill('/clear')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).not.toContainText('pergunta antiga')

  await input.fill('/login')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('/login')
  await page.getByRole('button', { name: 'Abrir em terminal' }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await app.close()
})
