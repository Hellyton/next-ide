import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/fork abre a sessão copiada num painel ao lado; antes da primeira mensagem avisa', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/fork')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Envie uma mensagem antes de copiar a sessão.')

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')

  await input.fill('/fork Experimento')
  await input.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'Experimento · claude' })).toBeVisible()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  // fakeSessions: the 'fake-fork' transcript is the first turn of the fake history.
  await expect(page.getByTestId('agent-panel').last().getByTestId('chat-view')).toContainText('resposta antiga')
  await app.close()
})
