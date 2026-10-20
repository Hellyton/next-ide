import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('/resume apaga uma conversa depois de confirmar', async () => {
  const { app, page } = await openAgent()
  // The toolbar button opens the same dialog as typing /resume.
  await page.getByRole('button', { name: 'Histórico de conversas' }).click()
  const dialog = page.getByRole('dialog', { name: 'Retomar sessão' })
  const row = dialog.getByTestId('resume-row').filter({ hasText: 'Sessão antiga de teste' })

  page.once('dialog', (d) => void d.dismiss())
  await row.hover()
  await row.getByRole('button', { name: 'Apagar conversa' }).click()
  await expect(row).toHaveCount(1)

  page.once('dialog', (d) => void d.accept())
  await row.getByRole('button', { name: 'Apagar conversa' }).click()
  await expect(row).toHaveCount(0)
  await expect(dialog).toContainText('Nenhuma sessão anterior neste projeto.')
  await app.close()
})
