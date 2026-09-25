import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/mcp lista servidores, desliga/liga e oferece login no terminal', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/mcp')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Servidores MCP' })
  const github = dialog.getByTestId('mcp-row').filter({ hasText: 'github' })
  await expect(github).toContainText('conectado')
  await expect(dialog.getByTestId('mcp-row').filter({ hasText: 'figma' })).toContainText('precisa de login')

  await dialog.getByRole('button', { name: 'Desligar github' }).click()
  await expect(github).toContainText('desligado')
  await dialog.getByRole('button', { name: 'Ligar github' }).click()
  await expect(github).toContainText('conectado')

  await dialog.getByRole('button', { name: 'Abrir em terminal' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · zsh` })).toBeVisible()
  await app.close()
})

test('/agents lista os subagentes e Esc fecha', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/agents')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Subagentes' })
  await expect(dialog).toContainText('code-reviewer')
  await expect(dialog).toContainText('Revisa diffs')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await app.close()
})
