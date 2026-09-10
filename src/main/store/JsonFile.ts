import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export class JsonFile<T> {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { value: T } | null = null

  constructor(
    private readonly path: string,
    private readonly fallback: () => T,
    private readonly debounceMs = 500,
  ) {}

  async read(): Promise<T> {
    let raw: string
    try {
      raw = await fs.readFile(this.path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return this.fallback()
      throw err
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      const backup = this.path.replace(/\.json$/, '') + `.corrupt-${Date.now()}.json`
      await fs.rename(this.path, backup)
      return this.fallback()
    }
  }

  async writeNow(value: T): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(tmp, this.path)
  }

  schedule(value: T): void {
    this.pending = { value }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.pending) return
    const { value } = this.pending
    this.pending = null
    await this.writeNow(value)
  }
}
