import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app abre com dock vazio', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('next-ide')
  await expect(page.getByText('Abra um projeto na barra lateral')).toBeVisible()
  await app.close()
})
