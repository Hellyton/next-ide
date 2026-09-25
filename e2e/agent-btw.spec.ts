import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/btw responde ao lado, sem entrar na conversa, e Esc fecha', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  const chat = page.getByTestId('chat-view')

  await input.fill('/btw')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Uso: /btw <pergunta>')

  await input.fill('/btw qual é o projeto?')
  await input.press('Enter')
  const card = page.getByTestId('btw-card')
  await expect(card).toContainText('Resposta lateral: qual é o projeto?')
  await expect(input).toHaveValue('')
  await expect(chat).not.toContainText('qual é o projeto?')

  await input.press('Escape')
  await expect(card).toHaveCount(0)

  await input.fill('/btw de novo')
  await input.press('Enter')
  await expect(card).toContainText('Resposta lateral: de novo')
  await page.getByRole('button', { name: 'Fechar /btw' }).click()
  await expect(card).toHaveCount(0)

  await app.close()
})
