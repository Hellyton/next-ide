import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, ImageAttachment } from '@shared/agent'
import { isEffortLevel, type AgentPanelParams } from '@shared/models'
import { restartSession } from '../../agent/restartSession'
import type { LocalCommand } from '../../agent/slash'
import { currentAgentParams, replacePanelParams, selectChat, useAgents } from '../../stores/agentStore'
import { useSessions } from '../../stores/sessionsStore'
import { AgentPanelContext } from './agentPanelContext'
import { BtwCard, type BtwState } from './BtwCard'
import { ChatActionsContext, type ChatActions } from './chatActions'
import { ChatView } from './ChatView'
import { Composer } from './Composer'
import { ResumeModal } from './ResumeModal'
import { StatusLine } from './StatusLine'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const MISSING_SESSION: AgentEvent = { kind: 'error', message: 'Sessão anterior não encontrada.', action: 'new-session' }

export function AgentPanel({ api, params }: IDockviewPanelProps<AgentPanelParams>) {
  const panelId = api.id
  const chat = useAgents(selectChat(panelId))
  const [resumeOpen, setResumeOpen] = useState(false)
  const [statusConfig, setStatusConfig] = useState(false)
  const [btw, setBtw] = useState<BtwState | null>(null)
  const btwSeq = useRef(0)

  const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao iniciar o agente: ${errorText(err)}` })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await window.api.invoke('agent:create', panelId, params)
      if (params.sessionId) {
        // Restored panel: show history now, spawn `claude --resume` only on the first send.
        if (useAgents.getState().chats[panelId]) return
        const history = await window.api.invoke('agent:history', params.projectPath, params.sessionId)
        if (cancelled) return
        useAgents.getState().load(panelId, history)
        // Transcript deleted/moved: resuming would fail on the first send, so offer a fresh session now.
        if (history.length === 0) useAgents.getState().apply(panelId, MISSING_SESSION)
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

  const askBtw = (question: string) => {
    const seq = ++btwSeq.current
    setBtw({ question, answer: null })
    void window.api
      .invoke('agent:btw', panelId, question)
      .catch((err) => ({ ok: false as const, message: errorText(err) }))
      .then((answer) => {
        if (btwSeq.current === seq) setBtw({ question, answer })
      })
  }

  const closeBtw = (): boolean => {
    if (!btw) return false
    if (btw.answer === null) void window.api.invoke('agent:btwCancel', panelId).catch(() => undefined)
    btwSeq.current++
    setBtw(null)
    return true
  }

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
      setSessionState: (id, state) => useSessions.getState().setState(id, state),
    })

  const base = (): AgentPanelParams => {
    const p = currentAgentParams(panelId) ?? params
    return { type: 'agent', projectPath: p.projectPath, ...(p.model ? { model: p.model } : {}), ...(p.permissionMode ? { permissionMode: p.permissionMode } : {}) }
  }

  // Stable object for the (memoized) chat cards; the ref always points at the latest closure.
  const newSessionRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    newSessionRef.current = () => void restart(base()).catch(fail)
  })
  const actions = useMemo<ChatActions>(() => ({ newSession: () => newSessionRef.current() }), [])
  const panelCtx = useMemo(() => ({ projectPath: params.projectPath }), [params.projectPath])

  const notify = (message: string) => useAgents.getState().apply(panelId, { kind: 'error', message })

  const onLocalCommand = (name: LocalCommand, arg: string) => {
    if (name === 'resume') setResumeOpen(true)
    else if (name === 'clear') void restart(base()).catch(fail)
    else if (name === 'model') document.getElementById(`model-select-${panelId}`)?.focus()
    else if (name === 'statusline') setStatusConfig(true)
    else if (name === 'effort') {
      if (!arg) document.getElementById(`effort-select-${panelId}`)?.focus()
      else if (arg === 'auto' || isEffortLevel(arg))
        void window.api.invoke('agent:setEffort', panelId, arg === 'auto' ? null : arg).catch((err) => notify(errorText(err)))
      else notify(`Esforço inválido: ${arg}. Use low, medium, high, xhigh, max ou auto.`)
    }
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
      <AgentPanelContext.Provider value={panelCtx}>
        <ChatActionsContext.Provider value={actions}>
          <ChatView items={chat.items} panelId={panelId} running={chat.state === 'running'} />
        </ChatActionsContext.Provider>
      </AgentPanelContext.Provider>
      {btw && <BtwCard btw={btw} onClose={closeBtw} />}
      <Composer
        panelId={panelId}
        chat={chat}
        projectPath={params.projectPath}
        onSend={send}
        onLocalCommand={onLocalCommand}
        onBtw={askBtw}
        onEscape={closeBtw}
      />
      <StatusLine
        panelId={panelId}
        projectPath={params.projectPath}
        chat={chat}
        configOpen={statusConfig}
        onConfigOpen={() => setStatusConfig(true)}
        onConfigClose={() => setStatusConfig(false)}
      />
      {resumeOpen && <ResumeModal projectPath={params.projectPath} onPick={resume} onClose={() => setResumeOpen(false)} />}
    </div>
  )
}
