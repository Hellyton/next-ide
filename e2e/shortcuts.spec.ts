import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('Cmd+\\ divide e Cmd+W fecha sem fechar a janela', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-keys-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await page.getByTestId('terminal').click()

  await page.keyboard.press('Meta+Backslash')
  await expect(page.getByTestId('panel-tab')).toHaveCount(2)
  await page.keyboard.press('Meta+w')
  await expect(page.getByTestId('panel-tab')).toHaveCount(1)
  expect(app.windows()).toHaveLength(1)
  await app.close()
})
