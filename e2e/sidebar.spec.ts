import { expect, test } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('cria workspace, adiciona pasta e abre terminal e agente', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-alpha-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('papersystem')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em papersystem' }).click()
  await expect(page.getByTestId('project-row').filter({ hasText: name })).toBeVisible()

  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()
  await expect(page.getByTestId('active-sessions')).toContainText(`${name} · zsh`)

  await page.getByPlaceholder('Filtrar projetos').fill('zzz-nada')
  await expect(page.getByTestId('project-row')).toHaveCount(0)
  await app.close()
})

test('importa .code-workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-'))
  mkdirSync(join(dir, 'papersystem-api'))
  mkdirSync(join(dir, 'papersystem-ui'))
  const file = join(dir, 'papersystem.code-workspace')
  writeFileSync(file, '{ "folders": [ { "path": "papersystem-api" }, { "path": "papersystem-ui" }, ] }')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_WORKSPACE: file } })

  await page.getByRole('button', { name: 'Importar .code-workspace' }).click()
  await expect(page.getByTestId('workspace-header').filter({ hasText: 'papersystem' })).toBeVisible()
  await expect(page.getByTestId('project-row')).toHaveCount(2)
  await app.close()
})
