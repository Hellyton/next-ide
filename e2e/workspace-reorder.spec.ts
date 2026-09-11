import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('reordena workspaces arrastando e mantém a ordem ao reabrir', async () => {
  const first = await launch()
  for (const name of ['alfa', 'beta']) {
    await first.page.getByRole('button', { name: 'Novo workspace' }).click()
    await first.page.getByPlaceholder('Nome do workspace').fill(name)
    await first.page.getByPlaceholder('Nome do workspace').press('Enter')
  }
  const headers = first.page.getByTestId('workspace-header')
  await expect(headers).toHaveText([/alfa/, /beta/])
  await headers.filter({ hasText: 'beta' }).dragTo(headers.filter({ hasText: 'alfa' }))
  await expect(headers).toHaveText([/beta/, /alfa/])
  await first.app.close()

  const second = await launch({ userData: first.userData })
  await expect(second.page.getByTestId('workspace-header')).toHaveText([/beta/, /alfa/])
  await second.app.close()
})
