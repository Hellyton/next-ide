import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function launch(
  opts: { userData?: string; env?: Record<string, string> } = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'next-ide-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...(process.env as Record<string, string>), NEXT_IDE_USER_DATA: userData, ...opts.env },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userData }
}
