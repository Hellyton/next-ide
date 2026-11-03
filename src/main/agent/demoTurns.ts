import { join } from 'node:path'

/**
 * Scripted, realistic-looking turns for the README screenshots (`npm run screenshots`).
 * Only reachable through the fake agent (NEXT_IDE_FAKE_AGENT=1): a prompt that matches a key below
 * plays its turn instead of the plain echo. No network, no subprocess.
 */
type Msg = Record<string, unknown>

let seq = 0
const uid = (p: string): string => `demo_${p}_${++seq}`

const assistant = (content: unknown[], parent: string | null = null): Msg => ({
  type: 'assistant',
  parent_tool_use_id: parent,
  message: { id: uid('msg'), model: 'claude-opus-5-5', content, usage: { input_tokens: 2400, output_tokens: 380, cache_read_input_tokens: 41000, cache_creation_input_tokens: 0 } },
})

const text = (t: string, parent: string | null = null): Msg => assistant([{ type: 'text', text: t }], parent)

const tool = (name: string, input: Record<string, unknown>, result: string, parent: string | null = null): Msg[] => {
  const id = uid('tool')
  return [
    assistant([{ type: 'tool_use', id, name, input }], parent),
    { type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: result }] } },
  ]
}

const CART_BEFORE = `export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0)
}`

const CART_AFTER = `export function cartTotal(items: CartItem[], code?: DiscountCode): number {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  if (!code || code.expiresAt < Date.now()) return subtotal
  const off = code.kind === 'percent' ? subtotal * (code.value / 100) : code.value
  return Math.max(0, round2(subtotal - off))
}`

export function demoTurn(prompt: string, cwd: string): Msg[] | null {
  const p = prompt.toLowerCase()
  if (p.includes('discount')) {
    return [
      text("I'll check how the cart computes its total before changing anything."),
      ...tool('Read', { file_path: join(cwd, 'src/cart.ts') }, `1\timport type { CartItem } from './types'\n2\t\n3\t${CART_BEFORE.split('\n').join('\n4\t')}`),
      ...tool('Grep', { pattern: 'cartTotal\\(', path: 'src' }, 'src/checkout.ts:18\nsrc/api/orders.ts:42\ntest/cart.test.ts:7'),
      ...tool('Edit', { file_path: join(cwd, 'src/cart.ts'), old_string: CART_BEFORE, new_string: CART_AFTER }, 'The file src/cart.ts has been updated.'),
      ...tool('Bash', { command: 'npm test -- cart', description: 'Run cart tests' }, ' ✓ test/cart.test.ts (9 tests) 14ms\n\n Test Files  1 passed (1)\n      Tests  9 passed (9)'),
      text(
        [
          'Done. `cartTotal` now accepts an optional **discount code**:',
          '',
          '- **percent** codes take a share of the subtotal; **fixed** codes subtract an amount',
          '- expired codes are ignored, and the total never goes below zero',
          '- the 2 call sites (`checkout.ts`, `api/orders.ts`) keep working — the parameter is optional',
          '',
          'Added 3 tests to `test/cart.test.ts`; the whole cart suite passes (9/9).',
        ].join('\n'),
      ),
    ]
  }
  if (p.includes('slow')) {
    const task = uid('task')
    return [
      assistant([{ type: 'tool_use', id: task, name: 'Task', input: { description: 'Profile the checkout path', prompt: 'Find why checkout is slow for large orders', subagent_type: 'Explore' } }]),
      ...tool('Grep', { pattern: 'await .*find', path: 'src/api' }, 'src/api/orders.ts:51:    const product = await db.products.find(item.sku)', task),
      text('Found an N+1 query in the order loop.', task),
      { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: task, content: 'N+1 query in createOrder' }] } },
      text(
        [
          'Checkout makes **one database query per line item** (`src/api/orders.ts:51`):',
          '',
          '```ts',
          'for (const item of cart.items) {',
          '  const product = await db.products.find(item.sku) // N round trips',
          '}',
          '```',
          '',
          '| Items | Queries | p95 |',
          '| ---: | ---: | ---: |',
          '| 5 | 6 | 40 ms |',
          '| 120 | 121 | 1.9 s |',
          '',
          'Fetching every SKU at once with `db.products.findMany(skus)` makes it a single query. Want me to apply it?',
        ].join('\n'),
      ),
    ]
  }
  return null
}
