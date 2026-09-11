import { createContext } from 'react'

/** Lets deeply nested (memoized) chat cards resolve relative tool paths against the panel's project. */
export const AgentPanelContext = createContext<{ projectPath: string }>({ projectPath: '' })
