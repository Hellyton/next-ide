import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/context mostra uso por categoria e arquivos de memória', async () => {
  const { app, page } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('/context')
  await input.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Uso do contexto' })
  await expect(dialog.getByTestId('context-total')).toContainText('18.000 / 200.000 tokens (9%)')
  await expect(dialog).toContainText('Messages')
  await expect(dialog).toContainText('CLAUDE.md')
  // Click the backdrop: a page-absolute (5, 5) can land on the sidebar instead of the panel, so
  // click near the agent panel's own top-left corner, clear of the dialog box.
  const panelBox = await page.getByTestId('agent-panel').boundingBox()
  await page.mouse.click((panelBox?.x ?? 0) + 10, (panelBox?.y ?? 0) + 10)
  await expect(dialog).toHaveCount(0)
  await app.close()
})
