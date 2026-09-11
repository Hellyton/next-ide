import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('envia mensagem e recebe resposta em streaming', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('olá mundo')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: olá mundo')
  await expect(input).toHaveValue('')
  await app.close()
})

test('Shift+Enter quebra linha sem enviar', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.click()
  await page.keyboard.type('linha 1')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('linha 2')
  await expect(page.getByTestId('user-bubble')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('user-bubble')).toHaveCount(1)
  await expect(page.getByTestId('user-bubble')).toContainText('linha 1')
  await expect(page.getByTestId('user-bubble')).toContainText('linha 2')
  await app.close()
})
