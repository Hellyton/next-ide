import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { openAgent } from './helpers'

test('/add-dir adiciona pasta, persiste, remove e recusa caminho inválido', async () => {
  const { app, page, userData } = await openAgent()
  const extra = realpathSync(mkdtempSync(join(tmpdir(), 'extra-dir-')))
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })

  await input.fill('/add-dir relativo')
  await input.press('Enter')
  await expect(page.getByTestId('composer-notice')).toContainText('Use um caminho absoluto')

  await input.fill(`/add-dir ${extra}`)
  await input.press('Enter')
  await expect(page.getByTestId('dirs-bar')).toContainText(basename(extra))
  await expect
    .poll(() => {
      try {
        return readFileSync(join(userData, 'layout.json'), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain(extra)

  await input.fill('oi')
  await input.press('Enter')
  await expect(page.getByTestId('chat-view')).toContainText('Você disse: oi')

  await page.getByRole('button', { name: `Remover pasta ${basename(extra)}` }).click()
  await expect(page.getByTestId('dirs-bar')).toHaveCount(0)
  await app.close()
})
