import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('reabrir o app restaura workspaces e painéis', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-restore-'))
  const name = basename(folder)
  const env = { NEXT_IDE_E2E_PICK_FOLDER: folder }

  const first = await launch({ env })
  await first.page.getByRole('button', { name: 'Novo workspace' }).click()
  await first.page.getByPlaceholder('Nome do workspace').fill('ws')
  await first.page.getByPlaceholder('Nome do workspace').press('Enter')
  await first.page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await first.page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await first.page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  await first.page.waitForTimeout(800)
  await first.app.close()

  const second = await launch({ userData: first.userData, env })
  await expect(second.page.getByTestId('project-row').filter({ hasText: name })).toBeVisible()
  await expect(second.page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await expect(second.page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await expect(second.page.getByTestId('active-sessions')).toContainText(`${name} · zsh`)
  await second.app.close()
})
