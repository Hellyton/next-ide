import { expect, test } from '@playwright/test'
import { fixtureProject, launch } from './helpers'

test('Cmd+P busca arquivos em todos os projetos e abre o escolhido', async () => {
  const { folder } = fixtureProject('proj-quick-')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()

  await page.keyboard.press('Meta+p')
  const search = page.getByRole('textbox', { name: 'Buscar arquivo' })
  await expect(search).toBeFocused()
  await search.fill('app')
  await expect(page.getByRole('listbox', { name: 'Arquivos encontrados' }).getByRole('option').first()).toContainText('src/app.ts')
  await search.press('Enter')
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'app.ts' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(0)

  await page.keyboard.press('Meta+p')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(0)
  await app.close()
})
