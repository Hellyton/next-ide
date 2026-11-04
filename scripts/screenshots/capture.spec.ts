import { test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { launch } from '../../e2e/helpers'

/**
 * Regenerates docs/images/*.png for the README. Run with `npm run screenshots`.
 * Everything is fake: throwaway demo projects under the OS temp dir and the scripted agent
 * (NEXT_IDE_FAKE_AGENT=1 + src/main/agent/demoTurns.ts). No account, network or real data.
 * With NEXT_IDE_SHOTS_RAW=<dir> it also keeps the full-size Retina captures there (used by the
 * promo video) and adds the video-only shots (Cmd+P, @ mentions, /context, /mcp, branches, statusline).
 */
const OUT = join(__dirname, '../../docs/images')
const SIZE = { width: 1600, height: 1000 }
const RAW = process.env.NEXT_IDE_SHOTS_RAW

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { cwd })
}

function write(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
}

function demoProjects(): { store: string; billing: string; blog: string } {
  // Fixed, short path: it shows up in tool cards and the file viewer.
  const base = '/tmp/next-ide-demo'
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base)
  const store = join(base, 'acme-store')
  write(store, {
    'package.json': JSON.stringify({ name: 'acme-store', version: '1.3.2', scripts: { test: 'vitest run' } }, null, 2) + '\n',
    'README.md': '# acme-store\n\nStorefront and checkout API.\n',
    '.gitignore': 'node_modules/\ndist/\n',
    'src/types.ts': [
      'export type CartItem = { sku: string; price: number; qty: number }',
      '',
      "export type DiscountCode = { code: string; kind: 'percent' | 'fixed'; value: number; expiresAt: number }",
      '',
    ].join('\n'),
    'src/cart.ts': [
      "import type { CartItem, DiscountCode } from './types'",
      '',
      'const round2 = (n: number): number => Math.round(n * 100) / 100',
      '',
      '/** Sum of the cart, after an optional discount code. Never negative. */',
      'export function cartTotal(items: CartItem[], code?: DiscountCode): number {',
      '  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)',
      '  if (!code || code.expiresAt < Date.now()) return subtotal',
      "  const off = code.kind === 'percent' ? subtotal * (code.value / 100) : code.value",
      '  return Math.max(0, round2(subtotal - off))',
      '}',
      '',
      'export function itemCount(items: CartItem[]): number {',
      '  return items.reduce((n, i) => n + i.qty, 0)',
      '}',
      '',
    ].join('\n'),
    'src/checkout.ts': "import { cartTotal } from './cart'\n\nexport async function checkout(cart: { items: [] }) {\n  return cartTotal(cart.items)\n}\n",
    'src/api/orders.ts': 'export async function createOrder() {}\n',
    'test/cart.test.ts': "import { describe, it, expect } from 'vitest'\n",
  })
  git(store, 'init', '-q', '-b', 'main')
  git(store, 'add', '.')
  git(store, 'commit', '-q', '-m', 'feat: cart and checkout')
  git(store, 'switch', '-q', '-c', 'feat/discount-codes')
  writeFileSync(join(store, 'test/cart.test.ts'), "import { describe, it, expect } from 'vitest'\nimport { cartTotal } from '../src/cart'\n\ndescribe('discount codes', () => {\n  it('applies percent codes', () => {})\n})\n")
  writeFileSync(join(store, 'src/api/orders.ts'), 'export async function createOrder() {\n  // TODO: batch product lookups\n}\n')

  const billing = join(base, 'billing-api')
  write(billing, { 'README.md': '# billing-api\n', 'src/index.ts': 'export {}\n' })
  git(billing, 'init', '-q', '-b', 'main')
  git(billing, 'add', '.')
  git(billing, 'commit', '-q', '-m', 'init')

  const blog = join(base, 'blog')
  write(blog, { 'README.md': '# blog\n', 'posts/hello.md': '# Hello\n' })
  git(blog, 'init', '-q', '-b', 'main')
  return { store, billing, blog }
}

function seed(userData: string, p: ReturnType<typeof demoProjects>): void {
  const proj = (id: string, path: string) => ({ id, name: path.split('/').pop()!, path })
  writeFileSync(
    join(userData, 'workspaces.json'),
    JSON.stringify([
      { id: 'w1', name: 'Work', collapsed: false, projects: [proj('p1', p.store), proj('p2', p.billing)] },
      { id: 'w2', name: 'Side projects', collapsed: false, projects: [proj('p3', p.blog)] },
    ]),
  )
}

async function start(): Promise<{ page: Page; close: () => Promise<void>; p: ReturnType<typeof demoProjects> }> {
  const p = demoProjects()
  const userData = mkdtempSync(join(tmpdir(), 'next-ide-demo-data-'))
  seed(userData, p)
  const zdotdir = mkdtempSync(join(tmpdir(), 'next-ide-demo-zsh-'))
  writeFileSync(join(zdotdir, '.zshrc'), "PROMPT='%F{blue}%1~%f %F{magenta}❯%f '\n")
  const { app, page } = await launch({ userData, env: { NEXT_IDE_FAKE_MODEL: 'claude-opus-5-5', ZDOTDIR: zdotdir } })
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height), SIZE)
  await page.waitForTimeout(800)
  return { page, close: () => app.close(), p }
}

async function ask(page: Page, prompt: string): Promise<void> {
  const box = page.getByRole('textbox').last()
  await box.fill(prompt)
  await box.press('Enter')
}

async function shot(page: Page, name: string, docs = true): Promise<void> {
  if (RAW) {
    mkdirSync(RAW, { recursive: true })
    await page.screenshot({ path: join(RAW, `${name}.png`) })
  }
  if (!docs) return
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path })
  // Retina captures are 3200px wide; 2400 keeps them sharp on GitHub at half the size.
  execFileSync('sips', ['-Z', '2400', path], { stdio: 'ignore' })
}

const openClaude = async (page: Page, project: string): Promise<void> => {
  await page.getByRole('button', { name: `Abrir Claude em ${project}` }).click()
  await page.waitForTimeout(400)
}

test('hero: two Claude sessions side by side', async () => {
  const { page, close } = await start()
  await openClaude(page, 'acme-store')
  await ask(page, 'Add discount codes to the cart total and cover them with tests')
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+Backslash')
  await page.waitForTimeout(500)
  await ask(page, 'Why is checkout slow on large orders?')
  await page.waitForTimeout(1200)
  await shot(page, 'hero')
  await close()
})

test('permission prompt', async () => {
  const { page, close } = await start()
  await openClaude(page, 'acme-store')
  await ask(page, 'Tag v1.4.0 and push the release')
  await page.waitForTimeout(1200)
  await shot(page, 'permissions')
  await close()
})

test('files, viewer and terminal', async () => {
  const { page, close } = await start()
  await page.getByRole('button', { name: 'Expandir arquivos de acme-store' }).click()
  const rows = page.getByTestId('tree-row')
  await rows.filter({ hasText: 'src' }).first().click()
  await rows.filter({ hasText: 'cart.ts' }).first().click()
  await page.waitForTimeout(1200)
  await page.keyboard.press('Meta+Shift+Backslash')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Abrir terminal em acme-store' }).click()
  const terminal = page.getByTestId('terminal').last()
  await terminal.click()
  await page.waitForTimeout(1200)
  await page.keyboard.type('git log --oneline --graph --all && git status --short\n')
  await page.waitForTimeout(1500)
  await shot(page, 'files-terminal')
  await close()
})

test('git panel', async () => {
  const { page, close } = await start()
  await openClaude(page, 'acme-store')
  await ask(page, 'Add discount codes to the cart total and cover them with tests')
  await page.waitForTimeout(800)
  await page.keyboard.press('Meta+Backslash')
  await page.waitForTimeout(800)
  await page.getByTestId('status-git').last().click()
  await page.waitForTimeout(1500)
  await shot(page, 'git')
  await close()
})

test('slash commands', async () => {
  const { page, close } = await start()
  await openClaude(page, 'acme-store')
  await ask(page, 'Add discount codes to the cart total and cover them with tests')
  await page.waitForTimeout(800)
  await page.getByRole('textbox').last().fill('/')
  await page.waitForTimeout(800)
  await shot(page, 'slash-commands')
  await close()
})

/** Opens a session and lets the demo turn finish, so the chat behind each popover is full. */
async function withSession(): Promise<{ page: Page; close: () => Promise<void> }> {
  const { page, close } = await start()
  await openClaude(page, 'acme-store')
  await ask(page, 'Add discount codes to the cart total and cover them with tests')
  await page.waitForTimeout(1500)
  return { page, close }
}

const command = async (page: Page, cmd: string): Promise<void> => {
  const box = page.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await box.fill(cmd)
  await box.press('Enter')
  await page.waitForTimeout(800)
}

test.describe('video-only shots', () => {
  test.skip(!RAW, 'set NEXT_IDE_SHOTS_RAW to capture them')

  test('quick open', async () => {
    const { page, close } = await withSession()
    await page.keyboard.press('Meta+p')
    await page.waitForTimeout(400)
    await page.keyboard.type('ts')
    await page.waitForTimeout(800)
    await shot(page, 'quickopen', false)
    await close()
  })

  test('mention', async () => {
    const { page, close } = await withSession()
    await page.getByRole('textbox', { name: 'Mensagem para o Claude' }).pressSequentially('Refactor @src/', { delay: 30 })
    await page.waitForTimeout(800)
    await shot(page, 'mention', false)
    await close()
  })

  test('context', async () => {
    const { page, close } = await withSession()
    await command(page, '/context')
    await shot(page, 'context', false)
    await close()
  })

  test('mcp', async () => {
    const { page, close } = await withSession()
    await command(page, '/mcp')
    await shot(page, 'mcp', false)
    await close()
  })

  test('branch picker', async () => {
    const { page, close } = await withSession()
    await page.getByTestId('status-branch').last().click()
    await page.waitForTimeout(800)
    await shot(page, 'branch', false)
    await close()
  })

  test('statusline', async () => {
    const { page, close } = await withSession()
    await command(page, '/statusline')
    await shot(page, 'statusline', false)
    await close()
  })
})
