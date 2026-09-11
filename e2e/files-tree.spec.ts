import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('árvore lista arquivos, respeita gitignore, mostra status e atualiza sozinha', async () => {
  const { folder, name } = fixtureProject()
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await expect(page.getByTestId('project-row').filter({ hasText: name })).toContainText('(main)')

  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  const rows = page.getByTestId('tree-row')
  await expect(rows.filter({ hasText: 'src' })).toBeVisible()
  await expect(rows.filter({ hasText: 'README.md' })).toHaveAttribute('data-status', 'U')
  await expect(rows.filter({ hasText: 'dist' })).toHaveCount(0)

  await rows.filter({ hasText: 'src' }).click()
  await expect(rows.filter({ hasText: 'app.ts' })).toBeVisible()
  writeFileSync(join(folder, 'src', 'novo.ts'), 'export {}')
  await expect(rows.filter({ hasText: 'novo.ts' })).toBeVisible({ timeout: 10_000 })

  await page.getByPlaceholder('Filtrar projetos').fill('app')
  await expect(page.getByTestId('file-search-result').filter({ hasText: 'src/app.ts' })).toBeVisible()
  await app.close()
})
