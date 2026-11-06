import { expect, test } from '@playwright/test'
import { openAgent } from './helpers'

// A background panel dockview keeps rendered (the agent behind a terminal tab) holds the window's
// previous size until it is shown again. If that overflowed the page, shrinking or maximizing the
// window brought page scrollbars, which on Windows steal width and make the layout shake in a loop.
test('a resize never makes the page itself scrollable', async () => {
  const { app, page, name } = await openAgent()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  for (const [w, h] of [
    [1100, 700],
    [1600, 1000],
    [900, 600],
  ] as const) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, h), [w, h])
    await expect
      .poll(() =>
        page.evaluate(() => {
          const d = document.documentElement
          return d.scrollWidth <= d.clientWidth && d.scrollHeight <= d.clientHeight && innerWidth === d.clientWidth
        }),
      )
      .toBe(true)
  }
  await app.close()
})
