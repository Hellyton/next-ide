import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/rename renomeia a sessão e a aba; antes da primeira mensagem avisa', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/rename Cedo demais')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Envie uma mensagem antes de renomear a sessão.')

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')
  await input.fill('/rename Refactor do login')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'Refactor do login · claude' })).toBeVisible()

  await input.fill('/clear')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await app.close()
})
