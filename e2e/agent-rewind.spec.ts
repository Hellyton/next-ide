import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/rewind volta código e conversa para antes de uma mensagem', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  const chat = page.getByTestId('chat-view')

  // Sessão com histórico conhecido (fakeSessions): h1 "pergunta antiga", h3 "segunda pergunta".
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(chat).toContainText('segunda resposta')

  await input.fill('/rewind')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await dialog.getByRole('button', { name: 'segunda pergunta' }).click()
  await expect(dialog.getByTestId('rewind-preview')).toContainText('1 arquivo(s) · +3 −1')
  await dialog.getByRole('button', { name: 'Código e conversa' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(input).toHaveValue('segunda pergunta')
  await expect(chat).toContainText('resposta antiga')
  await expect(chat).not.toContainText('segunda resposta')
  await app.close()
})

test('Esc Esc com o composer vazio abre o /rewind; voltar à primeira mensagem limpa o chat', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('segunda resposta')

  await input.press('Escape')
  await input.press('Escape')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await dialog.getByRole('button', { name: 'pergunta antiga' }).click()
  await dialog.getByRole('button', { name: 'Só conversa' }).click()
  await expect(input).toHaveValue('pergunta antiga')
  await expect(page.getByTestId('chat-view')).not.toContainText('resposta antiga')
  await app.close()
})

test('Esc no /rewind volta da mensagem escolhida para a lista e depois fecha', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('segunda resposta')

  await input.fill('/rewind')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await expect(dialog).toBeFocused()
  await dialog.getByRole('button', { name: 'segunda pergunta' }).click()
  await expect(dialog.getByRole('button', { name: 'Só conversa' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog.getByRole('button', { name: 'Só conversa' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'pergunta antiga' })).toBeVisible()
  // Keys go to the dialog, not the composer underneath.
  await page.keyboard.type('x')
  await expect(input).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(input).toBeFocused()
  await app.close()
})

test('/rename seguido de /rewind (só conversa) mantém o título da aba', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/resume')
  await input.press('Enter')
  await page.getByRole('button', { name: /Sessão antiga de teste/ }).click()
  await expect(page.getByTestId('chat-view')).toContainText('segunda resposta')

  await input.fill('/rename Refactor do login')
  await input.press('Enter')
  const tab = page.getByTestId('panel-tab').filter({ hasText: 'Refactor do login · claude' })
  await expect(tab).toBeVisible()

  await input.fill('/rewind')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Voltar para uma mensagem' })
  await dialog.getByRole('button', { name: 'segunda pergunta' }).click()
  await dialog.getByRole('button', { name: 'Só conversa' }).click()
  await expect(input).toHaveValue('segunda pergunta')
  await expect(page.getByTestId('chat-view')).not.toContainText('segunda resposta')
  await expect(tab).toBeVisible()
  await app.close()
})
