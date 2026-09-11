import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('mostra diff de edição e subagente agrupado', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('editar arquivo')
  await input.press('Enter')
  const diff = page.getByTestId('diff-card')
  await expect(diff).toContainText('/tmp/exemplo.ts')
  await expect(diff.locator('[data-kind="del"]')).toContainText('const a = 1')
  await expect(diff.locator('[data-kind="add"]')).toContainText('const a = 2')

  await diff.getByTestId('file-link').click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: 'exemplo.ts' })).toBeVisible()
  await expect(page.getByTestId('file-notice')).toContainText('fora das pastas')
  await expect(diff).toHaveAttribute('open', '')

  // Opening the file panel switched the active tab in the agent's group; switch back before continuing.
  await page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` }).click()
  await input.fill('rodar subagente')
  await input.press('Enter')
  const task = page.getByTestId('task-card')
  await expect(task).toContainText('Explorar o projeto')
  await task.locator('summary').click()
  await expect(task).toContainText('Resposta do subagente')
  await app.close()
})
