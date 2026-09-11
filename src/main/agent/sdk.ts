import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { SessionSummary } from '@shared/agent'
import type { QueryFn, QueryLike } from './AgentSession'

export type SessionStoreApi = {
  list(dir: string): Promise<SessionSummary[]>
  history(dir: string, sessionId: string): Promise<unknown[]>
}

export async function loadSdk(): Promise<{ queryFn: QueryFn } & SessionStoreApi> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  return {
    // Our option/message shapes are structural subsets of the SDK's; the casts only bridge
    // SDK-specific nominal types (PermissionUpdate, MessageParam) we deliberately don't import elsewhere.
    queryFn: ({ prompt, options }) =>
      sdk.query({ prompt: prompt as AsyncIterable<SDKUserMessage>, options: options as unknown as Options }) as unknown as QueryLike,
    list: async (dir) =>
      (await sdk.listSessions({ dir }))
        .map((s) => ({ sessionId: s.sessionId, title: s.customTitle || s.summary || s.firstPrompt || s.sessionId, lastModified: s.lastModified }))
        .sort((a, b) => b.lastModified - a.lastModified),
    history: (dir, sessionId) => sdk.getSessionMessages(sessionId, { dir }),
  }
}
