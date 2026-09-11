import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { launch } from './helpers'

test('terminal busca com Cmd+F e reinicia depois de sair', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'proj-term2-'))
  const name = basename(folder)
  const { app, page } = await launch({ env: { NEXT_IDE_E2E_PICK_FOLDER: folder } })
  await page.getByRole('button', { name: 'Novo workspace' }).click()
  await page.getByPlaceholder('Nome do workspace').fill('ws')
  await page.getByPlaceholder('Nome do workspace').press('Enter')
  await page.getByRole('button', { name: 'Adicionar pasta em ws' }).click()
  await page.getByRole('button', { name: `Abrir terminal em ${name}` }).click()

  const terminal = page.getByTestId('terminal')
  await terminal.click()
  await page.keyboard.type('echo marcador-unico\n')
  await expect(terminal.locator('.xterm-rows')).toContainText('marcador-unico', { timeout: 15_000 })

  await page.keyboard.press('Meta+f')
  const search = page.getByRole('textbox', { name: 'Buscar no terminal' })
  await expect(search).toBeFocused()
  await search.fill('marcador-unico')
  await expect(page.getByTestId('terminal-search-count')).toHaveText(/\d+\/\d+/)
  await search.press('Escape')
  await expect(search).toHaveCount(0)

  await terminal.click()
  await page.keyboard.type('exit\n')
  const restart = page.getByRole('button', { name: 'Reiniciar terminal' })
  await expect(restart).toBeVisible({ timeout: 15_000 })
  await restart.click()
  await expect(restart).toHaveCount(0)
  await page.keyboard.type('echo de-volta\n')
  await expect(terminal.locator('.xterm-rows')).toContainText('de-volta', { timeout: 15_000 })
  await app.close()
})
