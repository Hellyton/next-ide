import { create } from 'zustand'
import type { DictationEvent } from '@shared/dictation'
import { applyDictation, beginDictation, type DictationSnapshot } from '../agent/dictation'
import { useAgents } from './agentStore'

/** How long `stop()` waits for the helper's `ended` before unlocking the composer anyway. */
export const STOP_TIMEOUT_MS = 3000

type DictationState = {
  /** Panel recording (or finishing) right now; one at a time app-wide. */
  active: string | null
  stopping: boolean
  /** Helper status line (e.g. model download), cleared on `ready`. */
  status: string | null
  snapshot: DictationSnapshot | null
  /** Caret right after the dictated text, for the composer to restore on stop. */
  caret: number
  start(panelId: string, text: string, caret: number): Promise<void>
  stop(): Promise<void>
  handle(panelId: string, event: DictationEvent): void
}

let waiters: Array<() => void> = []
const idle = { active: null, stopping: false, status: null, snapshot: null } as const

const notice = (panelId: string, text: string) => useAgents.getState().setNotice(panelId, { text, command: '' })

export const useDictation = create<DictationState>()((set, get) => ({
  ...idle,
  caret: 0,
  start: async (panelId, text, caret) => {
    const { active } = get()
    if (active === panelId) return
    if (active) await get().stop()
    const snapshot = beginDictation(text, caret)
    set({ active: panelId, stopping: false, status: null, snapshot, caret: snapshot.originalCaret })
    try {
      const res = await window.api.invoke('dictation:start', panelId)
      if (!res.ok) {
        notice(panelId, res.message)
        if (get().active === panelId) set(idle)
      }
    } catch (err) {
      notice(panelId, `Falha ao iniciar o ditado: ${err instanceof Error ? err.message : String(err)}`)
      if (get().active === panelId) set(idle)
    }
  },
  stop: async () => {
    const { active } = get()
    if (!active) return
    set({ stopping: true })
    const ended = new Promise<void>((resolve) => {
      waiters.push(resolve)
      setTimeout(resolve, STOP_TIMEOUT_MS)
    })
    void window.api.invoke('dictation:stop', active).catch((err) => console.error('[next-ide] dictation stop failed', err))
    await ended
    if (get().active === active) set(idle)
  },
  handle: (panelId, event) => {
    const s = get()
    if (s.active !== panelId) return
    switch (event.type) {
      case 'ready':
        set({ status: null })
        return
      case 'status':
        set({ status: event.text })
        return
      case 'transcript': {
        if (!s.snapshot) return
        const next = applyDictation(s.snapshot, event.final, event.volatile)
        useAgents.getState().setDraft(panelId, next.text)
        set({ caret: next.caret })
        return
      }
      case 'error':
        notice(panelId, event.message)
        return
      case 'ended': {
        set(idle)
        const pending = waiters
        waiters = []
        for (const resolve of pending) resolve()
        return
      }
    }
  },
}))

let subscribed = false
export function subscribeDictationEvents(): void {
  if (subscribed) return
  subscribed = true
  window.api.on('dictation:event', (panelId, event) => useDictation.getState().handle(panelId, event))
}
