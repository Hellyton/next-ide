import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('botão e ⌘B recolhem e reabrem a sidebar, estado sobrevive ao reabrir', async () => {
  const first = await launch()
  const { page } = first
  const sidebar = page.getByTestId('sidebar')
  const toggle = page.getByTestId('sidebar-toggle')
  await expect(sidebar).toBeVisible()

  await toggle.click()
  await expect(sidebar).toBeHidden()
  await expect(page.getByTestId('sidebar-resizer')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Meta+b')
  await expect(sidebar).toBeVisible()
  await page.keyboard.press('Meta+b')
  await expect(sidebar).toBeHidden()
  await first.app.close()

  const second = await launch({ userData: first.userData })
  await expect(second.page.getByTestId('sidebar')).toBeHidden()
  await second.page.getByTestId('sidebar-toggle').click()
  await expect(second.page.getByTestId('sidebar')).toBeVisible()
  await second.app.close()
})
