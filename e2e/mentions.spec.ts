import { expect, test } from '@playwright/test'
import { fixtureProject, launch, openAgent } from './helpers'

test('menciona arquivo no agente pelo visualizador e pelo @ do composer', async () => {
  const { folder, name } = fixtureProject('proj-mention-')
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()

  // Sem agente aberto: o botão abre um novo e já insere a menção.
  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  await page.getByTestId('tree-row').filter({ hasText: 'README.md' }).click()
  await page.getByRole('button', { name: 'Mencionar no agente' }).click()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await expect(input).toHaveValue('@README.md ')

  await input.fill('')
  await input.pressSequentially('veja @app')
  await expect(page.getByRole('listbox', { name: 'Menções' }).getByRole('option').first()).toHaveText('@src/app.ts')
  await input.press('Enter')
  await expect(input).toHaveValue('veja @src/app.ts ')
  await app.close()
})

test('@agent- sugere subagentes e insere a menção', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('peça ao @agent-rev')
  const menu = page.getByRole('listbox', { name: 'Menções' })
  await expect(menu).toContainText('@agent-code-reviewer')
  await input.press('Enter')
  await expect(input).toHaveValue('peça ao @agent-code-reviewer ')
  await app.close()
})
