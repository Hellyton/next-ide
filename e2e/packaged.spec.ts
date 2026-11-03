import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

// NEXT_IDE_PACKAGED_APP points at another build, e.g. dist/mac/next-ide.app (Intel, runs under Rosetta).
const APP = process.env.NEXT_IDE_PACKAGED_APP ?? join(process.cwd(), 'dist', 'mac-arm64', 'next-ide.app')
const BIN = join(APP, 'Contents', 'MacOS', 'next-ide')

// Only runs against a build made by `npm run package`.
test.skip(!existsSync(BIN), 'packaged app not built')

test('o app empacotado abre, roda terminal e lista arquivos', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-packaged-'))
  const name = basename(folder)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: folder })
  const app = await electron.launch({
    executablePath: BIN,
    env: {
      ...(process.env as Record<string, string>),
      NEXT_IDE_USER_DATA: mkdtempSync(join(tmpdir(), 'packaged-data-')),
      NEXT_IDE_FAKE_AGENT: '1',
      NEXT_IDE_E2E_NO_QUIT_CONFIRM: '1',
      NEXT_IDE_E2E_PICK_FOLDER: folder,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()

  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()
  const terminal = page.getByTestId('terminal')
  await terminal.click()
  await page.keyboard.type('echo empacotado-ok\n')
  await expect(terminal.locator('.xterm-rows')).toContainText('empacotado-ok', { timeout: 20_000 })

  await page.getByRole('button', { name: `Expandir arquivos de ${name}` }).click()
  await expect(page.getByTestId('tree-row').filter({ hasText: '.git' })).toHaveCount(0)
  await app.close()
})
