import { OutputBatcher } from './OutputBatcher'

export type PtyLike = {
  onData(cb: (data: string) => void): unknown
  onExit(cb: (e: { exitCode: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export type SpawnFn = (cwd: string, cols: number, rows: number) => PtyLike

export type PtyEmitter = {
  data(panelId: string, chunk: string): void
  exit(panelId: string, exitCode: number): void
}

type Entry = { proc: PtyLike; batcher: OutputBatcher }

export class PtyManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly spawn: SpawnFn,
    private readonly emit: PtyEmitter,
    private readonly batchMs = 16,
  ) {}

  has(panelId: string): boolean {
    return this.entries.has(panelId)
  }

  create(panelId: string, cwd: string, cols: number, rows: number): void {
    this.kill(panelId)
    const proc = this.spawn(cwd, cols, rows)
    const batcher = new OutputBatcher((chunk) => this.emit.data(panelId, chunk), this.batchMs)
    proc.onData((data) => batcher.push(data))
    proc.onExit(({ exitCode }) => {
      if (this.entries.get(panelId)?.proc !== proc) return
      batcher.flush()
      this.entries.delete(panelId)
      this.emit.exit(panelId, exitCode)
    })
    this.entries.set(panelId, { proc, batcher })
  }

  write(panelId: string, data: string): void {
    this.entries.get(panelId)?.proc.write(data)
  }

  resize(panelId: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return
    this.entries.get(panelId)?.proc.resize(cols, rows)
  }

  kill(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (!entry) return
    this.entries.delete(panelId)
    entry.batcher.flush()
    entry.proc.kill()
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id)
  }
}
