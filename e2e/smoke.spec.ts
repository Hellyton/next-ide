import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app abre janela com título next-ide', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('next-ide')
  await expect(page.getByText('next-ide')).toBeVisible()
  await app.close()
})
