import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Terminal E2E specs must not depend on the developer's real login shell: a heavy
// .zshrc can swallow typed input or blow past the test timeout. Point zsh at an
// empty, throwaway ZDOTDIR so every spawned shell starts with no dotfiles at all.
function hermeticZshEnv(): Record<string, string> {
  const zdotdir = mkdtempSync(join(tmpdir(), 'next-ide-e2e-zdotdir-'))
  for (const file of ['.zshrc', '.zprofile', '.zlogin', '.zshenv']) {
    writeFileSync(join(zdotdir, file), '')
  }
  return { ZDOTDIR: zdotdir, SHELL: '/bin/zsh' }
}

export async function launch(
  opts: { userData?: string; env?: Record<string, string> } = {},
): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'next-ide-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
      NEXT_IDE_USER_DATA: userData,
      ...hermeticZshEnv(),
      ...opts.env,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userData }
}
