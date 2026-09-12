import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('arrasta a divisa da sidebar e mantém a largura ao reabrir', async () => {
  const first = await launch()
  const sidebar = first.page.getByTestId('sidebar')
  const handle = first.page.getByTestId('sidebar-resizer')
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(280, 0)

  const box = (await handle.boundingBox())!
  await first.page.mouse.move(box.x + box.width / 2, box.y + 200)
  await first.page.mouse.down()
  await first.page.mouse.move(box.x + 180, box.y + 200, { steps: 8 })
  await first.page.mouse.up()
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBeGreaterThan(400)
  const widened = Math.round((await sidebar.boundingBox())!.width)
  await first.app.close()

  const second = await launch({ userData: first.userData })
  await expect.poll(async () => Math.round((await second.page.getByTestId('sidebar').boundingBox())!.width)).toBe(widened)
  await second.app.close()
})
