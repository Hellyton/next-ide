import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('abre arquivo com destaque, numeração e recarrega quando muda em disco', async () => {
  const { folder, name } = fixtureProject('proj-viewer-')
  const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  writeFileSync(join(folder, 'logo.png'), Buffer.from(onePixelPng, 'base64'))
  writeFileSync(join(folder, 'blob.bin'), Buffer.from([0, 1, 2, 3]))
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  const rows = page.getByTestId('tree-row')
  await rows.filter({ hasText: 'src' }).click()
  await rows.filter({ hasText: 'app.ts' }).click()

  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toBeVisible()
  const code = page.getByTestId('file-code')
  await expect(code).toContainText('export const v80 = 80')
  await expect(code.locator('.line')).toHaveCount(80)
  await expect(code.locator('span[style*="color"]').first()).toBeVisible()

  writeFileSync(join(folder, 'src', 'app.ts'), 'export const mudou = true\n')
  await expect(code).toContainText('mudou', { timeout: 10_000 })

  await rows.filter({ hasText: 'app.ts' }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toHaveCount(1)

  await rows.filter({ hasText: 'logo.png' }).click()
  await expect(page.getByTestId('file-panel').locator('img')).toBeVisible()
  await rows.filter({ hasText: 'blob.bin' }).click()
  await expect(page.getByTestId('file-notice').filter({ hasText: 'binário' })).toBeVisible()
  await app.close()
})
