import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { launch } from './helpers'

test('adiciona várias pastas de uma vez e confirma antes de remover', async () => {
  const a = mkdtempSync(join(tmpdir(), 'proj-multi-a-'))
  const b = mkdtempSync(join(tmpdir(), 'proj-multi-b-'))
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: [a, b].join(delimiter) } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  const rows = page.getByTestId('project-row')
  await expect(rows).toHaveCount(2)

  const remove = page.getByRole('button', { name: `Remover ${basename(a)}` })
  page.once('dialog', (d) => void d.dismiss())
  await rows.filter({ hasText: basename(a) }).hover()
  await remove.click()
  await expect(rows).toHaveCount(2)

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Tem certeza que deseja remover o diretório')
    void d.accept()
  })
  await rows.filter({ hasText: basename(a) }).hover()
  await remove.click()
  await expect(rows).toHaveCount(1)
  await app.close()
})
