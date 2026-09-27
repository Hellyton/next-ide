import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('ditado escreve no cursor ao vivo, para no clique e não envia sozinho', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('olha:')

  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(input).toHaveValue('olha: abre o arquivo')
  await expect(input).toHaveJSProperty('readOnly', true)

  await page.getByRole('button', { name: 'Parar ditado' }).click()
  await expect(input).toHaveValue('olha: abre o arquivo de config')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await expect(input).toHaveJSProperty('readOnly', false)
  await expect(page.getByTestId('user-bubble')).toHaveCount(0)

  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: olha: abre o arquivo de config')
  await expect(input).toHaveValue('')
  await app.close()
})

test('Enter com o ditado ligado para, espera o texto final e envia', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(input).toHaveValue('abre o arquivo')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: abre o arquivo de config')
  await expect(input).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await app.close()
})

test('erro do helper vira aviso e o composer volta ao normal', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'error' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('antes')
  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(page.getByTestId('composer-notice')).toContainText('Permissão de microfone negada.')
  await expect(page.getByRole('button', { name: 'Ditado', exact: true })).toBeVisible()
  await expect(input).toHaveValue('antes')
  await expect(input).toHaveJSProperty('readOnly', false)
  await app.close()
})

test('depois de clicar no 🎤 o foco fica no campo: Enter para e envia', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await page.getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(input).toHaveValue('abre o arquivo')
  await expect(input).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: abre o arquivo de config')
  await app.close()
})

test('ditar em outro painel não rouba o foco para o painel anterior', async () => {
  const { app, page } = await openAgent({ env: { NEXT_IDE_E2E_FAKE_DICTATION: 'ok' } })
  const inputs = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await inputs.first().click()
  await page.keyboard.press('Meta+Backslash')
  await expect(inputs).toHaveCount(2)
  const toolbars = page.getByTestId('composer-toolbar')
  await toolbars.nth(0).getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(inputs.nth(0)).toHaveValue('abre o arquivo')
  await toolbars.nth(1).getByRole('button', { name: 'Ditado', exact: true }).click()
  await expect(inputs.nth(0)).toHaveValue('abre o arquivo de config')
  await expect(inputs.nth(1)).toHaveValue('abre o arquivo')
  await expect(inputs.nth(1)).toBeFocused()
  await app.close()
})
