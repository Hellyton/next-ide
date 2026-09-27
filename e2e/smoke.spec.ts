import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('app abre com dock vazio', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('next-ide')
  await expect(page.getByText('Abra um projeto na barra lateral')).toBeVisible()
  await app.close()
})

test('rodapé da sidebar mostra versão e commit do build', async () => {
  const { app, page } = await launch()
  await expect(page.getByTestId('build-info')).toHaveText(/^v\d+\.\d+\.\d+ · [0-9a-f]{7,}\+? · \d{2}\/\d{2} \d{2}:\d{2}$/)
  await app.close()
})
