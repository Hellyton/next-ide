import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('mostra diff de edição e subagente agrupado', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('editar arquivo')
  await input.press('Enter')
  const diff = page.getByTestId('diff-card')
  await expect(diff).toContainText('/tmp/exemplo.ts')
  await expect(diff.locator('[data-kind="del"]')).toContainText('const a = 1')
  await expect(diff.locator('[data-kind="add"]')).toContainText('const a = 2')

  await input.fill('rodar subagente')
  await input.press('Enter')
  const task = page.getByTestId('task-card')
  await expect(task).toContainText('Explorar o projeto')
  await task.locator('summary').click()
  await expect(task).toContainText('Resposta do subagente')
  await app.close()
})
