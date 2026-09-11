import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('terminal roda comandos no cwd do projeto', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-term-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })

  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()

  const terminal = page.getByTestId('terminal')
  await terminal.click()
  await page.keyboard.type('echo "ok-$(basename $PWD)"\n')
  await expect(terminal.locator('.xterm-rows')).toContainText(`ok-${name}`, { timeout: 15_000 })

  await page.getByRole('button', { name: `Fechar ${name} · zsh` }).click()
  await expect(page.getByTestId('active-sessions')).not.toContainText(`${name} · zsh`)
  await app.close()
})
