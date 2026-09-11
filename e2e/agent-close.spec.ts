import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

test('fechar agente aguardando permissão pede confirmação', async () => {
  const { app, page, name } = await openAgent()
  const input = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('teste de permissão')
  await input.press('Enter')
  await expect(page.getByTestId('permission-card')).toBeVisible()

  page.once('dialog', (d) => void d.dismiss())
  await page.getByRole('button', { name: `Fechar ${name} · claude` }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toBeVisible()

  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: `Fechar ${name} · claude` }).click()
  await expect(page.getByTestId('panel-tab').filter({ hasText: `${name} · claude` })).toHaveCount(0)
  await expect(page.getByTestId('active-sessions')).not.toContainText(`${name} · claude`)
  await app.close()
})
