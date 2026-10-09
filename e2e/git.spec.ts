import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureProject, launch } from './helpers'

test('git: troca de branch pela statusline e commit pelo painel Git', async () => {
  const { folder, name } = fixtureProject('proj-git-')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim()
  git('config', 'user.email', 'e2e@example.com')
  git('config', 'user.name', 'E2E')
  git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', 'inicial')
  git('branch', 'outra')
  writeFileSync(join(folder, 'README.md'), '# fixture\nlinha nova\n')

  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir Claude em ${name}` }).click()

  const branch = page.getByTestId('status-branch')
  await expect(branch).toContainText('main')
  await branch.click()
  const picker = page.getByTestId('branch-picker')
  await picker.getByRole('button', { name: 'outra' }).click()
  await expect(branch).toContainText('outra')
  expect(git('branch', '--show-current')).toBe('outra')

  await branch.click()
  await picker.getByPlaceholder('Filtrar ou criar branch').fill('feat/nova')
  await picker.getByRole('button', { name: /Criar branch/ }).click()
  await expect(branch).toContainText('feat/nova')

  await expect(page.getByTestId('status-git')).toContainText('●1')
  await page.getByTestId('status-git').click()
  const panel = page.getByTestId('git-panel')
  await expect(panel.getByTestId('git-change')).toContainText('README.md')
  await expect(panel.getByTestId('git-diff')).toContainText('linha nova')
  await expect(panel.getByTestId('git-sync')).toContainText('Publicar branch')
  await panel.getByTestId('git-summary').fill('atualiza readme')
  await panel.getByTestId('git-commit').click()
  await expect(panel).toContainText('Nenhuma alteração')
  expect(git('log', '-1', '--format=%s')).toBe('atualiza readme')
  expect(git('status', '--porcelain')).toBe('')
  await app.close()
})
