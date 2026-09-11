import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect } from 'react'
import type { ImageAttachment } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { selectChat, useAgents } from '../../stores/agentStore'
import { ChatView } from './ChatView'
import { Composer } from './Composer'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function AgentPanel({ api, params }: IDockviewPanelProps<AgentPanelParams>) {
  const panelId = api.id
  const chat = useAgents(selectChat(panelId))

  useEffect(() => {
    let cancelled = false
    const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao iniciar o agente: ${errorText(err)}` })
    void (async () => {
      await window.api.invoke('agent:create', panelId, params)
      if (params.sessionId) {
        // Restored panel: show history now, spawn `claude --resume` only on the first send.
        if (useAgents.getState().chats[panelId]) return
        const history = await window.api.invoke('agent:history', params.projectPath, params.sessionId)
        if (!cancelled) useAgents.getState().load(panelId, history)
      } else {
        await window.api.invoke('agent:start', panelId)
      }
    })().catch(fail)
    return () => {
      cancelled = true
    }
    // Params are read once per panel: later changes (sessionId/model/mode) come from this same session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  const send = (text: string, images: ImageAttachment[]) =>
    void window.api
      .invoke('agent:send', panelId, text, images)
      .catch((err) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao enviar: ${errorText(err)}` }))

  return (
    <div className="flex h-full flex-col bg-neutral-950" data-testid="agent-panel">
      <ChatView items={chat.items} panelId={panelId} />
      <Composer panelId={panelId} chat={chat} onSend={send} />
    </div>
  )
}
