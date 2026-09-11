import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, openAgent } from './helpers'

test('painel de agente restaurado mostra histórico e continua a sessão', async () => {
  const first = await openAgent()
  const input = first.page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await input.fill('oi')
  await input.press('Enter')
  await expect(first.page.getByTestId('chat-view')).toContainText('Você disse: oi')
  await expect
    .poll(() => {
      try {
        return readFileSync(join(first.userData, 'layout.json'), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain('fake-session')
  await first.app.close()

  const second = await launch({ userData: first.userData, env: { NEXT_IDE_E2E_PICK_FOLDER: first.folder } })
  await expect(second.page.getByTestId('panel-tab').filter({ hasText: `${first.name} · claude` })).toBeVisible()
  await expect(second.page.getByTestId('chat-view')).toContainText('resposta antiga')
  const again = second.page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await again.fill('continuando')
  await again.press('Enter')
  await expect(second.page.getByTestId('chat-view')).toContainText('Você disse: continuando')
  await second.app.close()
})
