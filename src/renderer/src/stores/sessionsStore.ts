import { create } from 'zustand'
import type { SessionState } from '@shared/models'

export type SessionInfo = {
  panelId: string
  type: 'agent' | 'terminal'
  projectPath: string
  title: string
  state: SessionState
}

type SessionsState = {
  byId: Record<string, SessionInfo>
  order: string[]
  add(session: SessionInfo): void
  remove(panelId: string): void
  setState(panelId: string, state: SessionState): void
}

export const useSessions = create<SessionsState>()((set) => ({
  byId: {},
  order: [],
  add: (session) =>
    set((st) =>
      st.byId[session.panelId]
        ? st
        : { byId: { ...st.byId, [session.panelId]: session }, order: [...st.order, session.panelId] },
    ),
  remove: (panelId) =>
    set((st) => {
      if (!st.byId[panelId]) return st
      const { [panelId]: _removed, ...rest } = st.byId
      return { byId: rest, order: st.order.filter((id) => id !== panelId) }
    }),
  setState: (panelId, state) =>
    set((st) => {
      const current = st.byId[panelId]
      return current ? { byId: { ...st.byId, [panelId]: { ...current, state } } } : st
    }),
}))
