import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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

  it('writeNow cancels a pending scheduled value', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 20)
    file.schedule({ n: 1 })
    await file.writeNow({ n: 2 })
    await sleep(60)
    expect(await file.read()).toEqual({ n: 2 })
  })

  it('concurrent writeNow calls do not collide and the last wins', async () => {
    const path = join(dir(), 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }))
    await Promise.all([file.writeNow({ n: 1 }), file.writeNow({ n: 2 }), file.writeNow({ n: 3 })])
    expect(await file.read()).toEqual({ n: 3 })
    const files = readdirSync(join(path, '..'))
    expect(files.filter((f) => f.endsWith('.tmp')).length).toBe(0)
  })

  it('a failing scheduled write is logged, not thrown', async () => {
    const d = dir()
    const blocker = join(d, 'blocker')
    writeFileSync(blocker, 'content')
    const path = join(blocker, 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 10)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    file.schedule({ n: 1 })
    await sleep(50)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]).toBe('[next-ide] failed to persist')
    spy.mockRestore()
  })

  it('flush rejects to its caller when the write fails', async () => {
    const d = dir()
    const blocker = join(d, 'blocker')
    writeFileSync(blocker, 'content')
    const path = join(blocker, 'a.json')
    const file = new JsonFile(path, () => ({ n: 0 }), 10_000)
    file.schedule({ n: 1 })
    await expect(file.flush()).rejects.toThrow()
  })
})
