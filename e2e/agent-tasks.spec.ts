import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('barra de tarefas mostra a tarefa em segundo plano e para ela', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('rode uma tarefa')
  await input.press('Enter')
  const bar = page.getByTestId('tasks-bar')
  await expect(bar).toContainText('npm run build')
  await expect(bar).toContainText('Bash')
  await page.getByRole('button', { name: 'Parar tarefa npm run build' }).click()
  await expect(bar).toContainText('parada')
  await expect(bar).toHaveCount(0, { timeout: 8000 })

  // Ctrl+B with the agent idle does nothing (no notice, no error).
  await input.press('Control+b')
  await expect(page.getByTestId('composer-notice')).toHaveCount(0)
  await app.close()
})
