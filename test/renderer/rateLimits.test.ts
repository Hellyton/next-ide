import { beforeEach, describe, expect, it } from 'vitest'
import { handleAgentEvent, useAgents } from '@renderer/stores/agentStore'
import { useSessions } from '@renderer/stores/sessionsStore'

describe('rate limits', () => {
  beforeEach(() => {
    useAgents.setState({ chats: {}, drafts: {}, rateLimits: {} })
    useSessions.setState({ byId: {}, order: [] })
  })

  it('are stored account-wide, even from a panel that is gone, and never touch a chat', () => {
    handleAgentEvent('gone', { kind: 'rate-limit', window: 'five_hour', usedPct: 97, resetsAt: 1_900_000_000 })
    handleAgentEvent('gone', { kind: 'rate-limit', window: 'seven_day', usedPct: 16 })
    expect(useAgents.getState().rateLimits).toEqual({
      five_hour: { used_percentage: 97, resets_at: 1_900_000_000 },
      seven_day: { used_percentage: 16 },
    })
    expect(useAgents.getState().chats).toEqual({})
  })
})
