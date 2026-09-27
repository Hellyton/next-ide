import type { Outcome } from '@shared/agent'
import { parseDictationLine, type DictationEvent } from '@shared/dictation'

export interface ChildLike {
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null
  on(event: 'exit', cb: (code: number | null) => void): unknown
  on(event: 'error', cb: (err: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

export type DictationDeps = {
  spawn: () => ChildLike
  exists: () => boolean
  emit: (panelId: string, event: DictationEvent) => void
  killTimeoutMs?: number
}

type Recording = { panelId: string; child: ChildLike; sawError: boolean; ended: boolean; killTimer: ReturnType<typeof setTimeout> | null }

/** Runs the Swift dictation helper for one panel at a time and relays its stdout as events. */
export class DictationManager {
  private active: Recording | null = null

  constructor(private readonly deps: DictationDeps) {}

  start(panelId: string): Outcome<null> {
    if (this.active?.panelId === panelId) return { ok: true, value: null }
    if (this.active) this.stop(this.active.panelId)
    if (!this.deps.exists()) return { ok: false, message: 'Helper de ditado não encontrado (rode npm run build:dictation).' }
    let child: ChildLike
    try {
      child = this.deps.spawn()
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
    const rec: Recording = { panelId, child, sawError: false, ended: false, killTimer: null }
    this.active = rec
    let buffer = ''
    child.stdout?.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = parseDictationLine(line)
        if (!event) {
          console.error('[next-ide] dictation: ignoring line', line)
          continue
        }
        if (event.type === 'error') rec.sawError = true
        this.deps.emit(panelId, event)
      }
    })
    child.on('exit', (code) => {
      if (code !== 0 && code !== null && !rec.sawError) {
        this.deps.emit(panelId, { type: 'error', message: `O ditado parou inesperadamente (código ${code}).` })
      }
      this.end(rec)
    })
    child.on('error', (err) => {
      rec.sawError = true
      this.deps.emit(panelId, { type: 'error', message: `Falha ao iniciar o ditado: ${err.message}` })
      this.end(rec)
    })
    return { ok: true, value: null }
  }

  stop(panelId: string): void {
    const rec = this.active
    if (!rec || rec.panelId !== panelId) return
    this.active = null
    rec.child.kill('SIGTERM')
    rec.killTimer = setTimeout(() => {
      if (!rec.ended) rec.child.kill('SIGKILL')
    }, this.deps.killTimeoutMs ?? 3000)
  }

  stopAll(): void {
    if (this.active) this.stop(this.active.panelId)
  }

  private end(rec: Recording): void {
    if (rec.ended) return
    rec.ended = true
    if (rec.killTimer) clearTimeout(rec.killTimer)
    if (this.active === rec) this.active = null
    this.deps.emit(rec.panelId, { type: 'ended' })
  }
}
