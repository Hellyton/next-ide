import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

  // Not an inline image and not on disk (no path to hand the agent).
  await fileInput.setInputFiles({ name: 'grande.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByTestId('composer-notice')).toContainText('grande.svg: arquivo sem caminho no disco')
  await app.close()
})

test('envia só com imagem, sem texto', async () => {
  const { app, page } = await openAgent()
  const fileInput = page.getByTestId('image-input')
  await fileInput.setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'print.png' })).toBeVisible()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.press('Enter')
  await expect(page.getByTestId('user-bubble')).toContainText('1 imagem(ns)')
  await app.close()
})

test('anexa pdf/csv como @caminho e aceita arquivos soltos em qualquer parte do chat', async () => {
  const { app, page, folder } = await openAgent()
  mkdirSync(join(folder, 'dados'))
  writeFileSync(join(folder, 'dados', 'vendas.csv'), 'a,b\n1,2\n')
  writeFileSync(join(folder, 'Relatório final.pdf'), '%PDF-1.4\n')
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('resuma')
  await page.getByTestId('image-input').setInputFiles([join(folder, 'dados', 'vendas.csv'), join(folder, 'Relatório final.pdf')])
  await expect(input).toHaveValue('resuma @dados/vendas.csv @"Relatório final.pdf" ')

  // Drag over the chat history (not just the composer): overlay shows, the image lands as an attachment.
  const chat = page.getByTestId('chat-view')
  const dt = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'solto.png', { type: 'image/png' }))
    return data
  }, PNG.toString('base64'))
  await chat.dispatchEvent('dragenter', { dataTransfer: dt })
  await expect(page.getByTestId('drop-overlay')).toBeVisible()
  await chat.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'solto.png' })).toBeVisible()
  await app.close()
})
