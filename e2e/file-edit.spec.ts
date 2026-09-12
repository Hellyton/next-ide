import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('edita e salva um arquivo do projeto', async () => {
  const { folder, name } = fixtureProject('proj-edit-')
  const target = join(folder, 'README.md')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  await page.getByTestId('tree-row').filter({ hasText: 'README.md' }).click()
  await expect(page.getByTestId('file-code')).toContainText('fixture')

  await page.getByTestId('file-edit').click()
  const editor = page.getByTestId('file-editor')
  await expect(editor).toBeFocused()
  await editor.fill('# editado pela IDE\n')
  await expect(page.getByTestId('file-dirty')).toBeVisible()
  await page.keyboard.press('Meta+s')

  await expect.poll(() => readFileSync(target, 'utf8')).toBe('# editado pela IDE\n')
  await expect(page.getByTestId('file-dirty')).toHaveCount(0)
  await expect(page.getByTestId('file-code')).toContainText('editado pela IDE')

  // Someone else changes the file while there are unsaved edits: the panel offers a reload.
  await editor.fill('# rascunho\n')
  writeFileSync(target, '# veio de fora\n')
  await expect(page.getByTestId('file-stale')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Recarregar do disco' }).click()
  await expect(page.getByTestId('file-code')).toContainText('veio de fora')
  await expect(page.getByTestId('file-editor')).toHaveCount(0)
  await app.close()
})
