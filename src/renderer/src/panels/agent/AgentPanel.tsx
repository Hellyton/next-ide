import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useState } from 'react'
import type { AgentEvent, ImageAttachment } from '@shared/agent'
import type { AgentPanelParams } from '@shared/models'
import { restartSession } from '../../agent/restartSession'
import type { LocalCommand } from '../../agent/slash'
import { currentAgentParams, replacePanelParams, selectChat, useAgents } from '../../stores/agentStore'
import { ChatView } from './ChatView'
import { Composer } from './Composer'
import { ResumeModal } from './ResumeModal'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function AgentPanel({ api, params }: IDockviewPanelProps<AgentPanelParams>) {
  const panelId = api.id
  const chat = useAgents(selectChat(panelId))
  const [resumeOpen, setResumeOpen] = useState(false)

  const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao iniciar o agente: ${errorText(err)}` })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await window.api.invoke('agent:create', panelId, params)
      if (params.sessionId) {
        // Restored panel: show history now, spawn `claude --resume` only on the first send.
        if (useAgents.getState().chats[panelId]) return
        const history = await window.api.invoke('agent:history', params.projectPath, params.sessionId)
        if (!cancelled) useAgents.getState().load(panelId, history)
      } else if (!cancelled) {
        await window.api.invoke('agent:start', panelId)
      }
    })().catch((err) => {
      if (!cancelled) fail(err)
    })
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

  const restart = (next: AgentPanelParams, history: AgentEvent[] = []) =>
    restartSession(panelId, next, history, {
      invoke: window.api.invoke,
      getChat: (id) => useAgents.getState().chats[id],
      setChat: (id, nextChat) => useAgents.getState().setChat(id, nextChat),
      clearChat: (id) => useAgents.getState().clear(id),
      loadChat: (id, events) => useAgents.getState().load(id, events),
      currentParams: currentAgentParams,
      replaceParams: replacePanelParams,
      apply: (id, event) => useAgents.getState().apply(id, event),
    })

  const base = (): AgentPanelParams => {
    const p = currentAgentParams(panelId) ?? params
    return { type: 'agent', projectPath: p.projectPath, ...(p.model ? { model: p.model } : {}), ...(p.permissionMode ? { permissionMode: p.permissionMode } : {}) }
  }

  const onLocalCommand = (name: LocalCommand) => {
    if (name === 'resume') setResumeOpen(true)
    else if (name === 'clear') void restart(base()).catch(fail)
    else if (name === 'model') document.getElementById(`model-select-${panelId}`)?.focus()
    // 'statusline' is handled in Task 11
  }

  const resume = (sessionId: string) => {
    setResumeOpen(false)
    void (async () => {
      const history = await window.api.invoke('agent:history', params.projectPath, sessionId)
      await restart({ ...base(), sessionId }, history)
    })().catch(fail)
  }

  return (
    <div className="relative flex h-full flex-col bg-neutral-950" data-testid="agent-panel">
      <ChatView items={chat.items} panelId={panelId} />
      <Composer panelId={panelId} chat={chat} projectPath={params.projectPath} onSend={send} onLocalCommand={onLocalCommand} />
      {resumeOpen && <ResumeModal projectPath={params.projectPath} onPick={resume} onClose={() => setResumeOpen(false)} />}
    </div>
  )
}
