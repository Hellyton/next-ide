import { createContext } from 'react'

/** Panel-level actions chat cards can trigger (kept in context so memoized cards stay stable). */
export type ChatActions = { newSession(): void }

export const ChatActionsContext = createContext<ChatActions>({ newSession: () => undefined })
