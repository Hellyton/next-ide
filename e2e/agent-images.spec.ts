import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('anexa imagem, remove, anexa de novo e envia', async () => {
  const { app, page } = await openAgent()
  const fileInput = page.getByTestId('image-input')
  await fileInput.setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'print.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Remover imagem print.png' }).click()
  await expect(page.getByRole('img', { name: 'print.png' })).toHaveCount(0)

  await fileInput.setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'print.png' })).toBeVisible()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('veja')
  await input.press('Enter')
  await expect(page.getByTestId('user-bubble')).toContainText('1 imagem(ns)')
  await expect(page.getByRole('img', { name: 'print.png' })).toHaveCount(0)

  await fileInput.setInputFiles({ name: 'grande.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByTestId('composer-notice')).toContainText('formato não suportado')
  await app.close()
})
