import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonFile } from '../../src/main/store/JsonFile'

const dir = () => mkdtempSync(join(tmpdir(), 'jsonfile-'))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('JsonFile', () => {
  it('returns fallback when file is missing', async () => {
    const file = new JsonFile(join(dir(), 'a.json'), () => ({ n: 1 }))
    expect(await file.read()).toEqual({ n: 1 })
  })

  it('round-trips a value with writeNow', async () => {
    const path = join(dir(), 'nested', 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }))
    await file.writeNow({ n: 42 })
    expect(await new JsonFile(path, () => ({ n: 0 })).read()).toEqual({ n: 42 })
  })

  it('backs up a corrupt file and returns fallback', async () => {
    const d = dir()
    const path = join(d, 'a.json')
    writeFileSync(path, '{ not json')
    const file = new JsonFile(path, () => ({ n: 7 }))
    expect(await file.read()).toEqual({ n: 7 })
    expect(readdirSync(d).some((f) => /^a\.corrupt-\d+\.json$/.test(f))).toBe(true)
  })

  it('debounces scheduled writes and keeps the last value', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 20)
    file.schedule({ n: 1 })
    file.schedule({ n: 2 })
    await sleep(60)
    expect(await file.read()).toEqual({ n: 2 })
  })

  it('flush writes pending value immediately', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 10_000)
    file.schedule({ n: 3 })
    await file.flush()
    expect(await file.read()).toEqual({ n: 3 })
  })

  it('supports null as a scheduled value', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile<{ n: number } | null>(path, () => ({ n: 1 }), 10_000)
    file.schedule(null)
    await file.flush()
    expect(await file.read()).toBeNull()
  })
})
