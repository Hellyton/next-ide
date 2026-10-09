import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, ImageAttachment } from '@shared/agent'
import { isEffortLevel, type AgentPanelParams, type EffortLevel, type PermissionMode } from '@shared/models'
import { nextMode, parseMode } from '../../agent/permissions'
import { restartSession } from '../../agent/restartSession'
import { rewindTargets, runRewind, type RewindMode, type RewindTarget } from '../../agent/rewind'
import type { LocalCommand } from '../../agent/slash'
import { useDock } from '../../dock/dockStore'
import { panelTitle } from '../../dock/panelOptions'
import { currentAgentParams, replacePanelParams, selectChat, useAgents } from '../../stores/agentStore'
import { useSessions } from '../../stores/sessionsStore'
import { rememberProjectDefault } from '../../stores/settingsStore'
import { AgentPanelContext } from './agentPanelContext'
import { BtwCard, type BtwState } from './BtwCard'
import { ChatActionsContext, type ChatActions } from './chatActions'
import { ChatView } from './ChatView'
import { Composer } from './Composer'
import { AgentsModal } from './AgentsModal'
import { ContextModal } from './ContextModal'
import { DirsBar } from './DirsBar'
import { McpModal } from './McpModal'
import { ResumeModal } from './ResumeModal'
import { RewindModal } from './RewindModal'
import { StatusLine } from './StatusLine'
import { TasksBar } from './TasksBar'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const cleanTitle = (title: string): string => title.replace(/\s*[\r\n]+\s*/g, ' ').trim()
const MISSING_SESSION: AgentEvent = { kind: 'error', message: 'Sessão anterior não encontrada.', action: 'new-session' }

export function AgentPanel({ api, params }: IDockviewPanelProps<AgentPanelParams>) {
  const panelId = api.id
  const chat = useAgents(selectChat(panelId))
  const [resumeOpen, setResumeOpen] = useState(false)
  const [rewindOpen, setRewindOpen] = useState(false)
  const [statusConfig, setStatusConfig] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [btw, setBtw] = useState<BtwState | null>(null)
  const btwSeq = useRef(0)
  // A rewind/rename in flight: blocks sending and starting another one. The ref is the synchronous guard.
  const [pending, setPendingState] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)
  const setPending = (value: string | null) => {
    pendingRef.current = value
    setPendingState(value)
  }

  const fail = (err: unknown) => useAgents.getState().apply(panelId, { kind: 'error', message: `Falha ao iniciar o agente: ${errorText(err)}` })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await window.api.invoke('agent:create', panelId, params)
      if (params.sessionId) {
        // Restored panel: show history now, spawn `claude --resume` only on the first send.
        // `chats[panelId]` may already exist here — agent:create's synchronous `mode`/`effort`
        // events can land before this await resolves — but that entry never has a `user` item,
        // so it's never a loaded transcript; only a real (StrictMode) double-run of this effect is.
        // The other half of double-invoke safety is the `cancelled` flag below: the first run's
        // in-flight `agent:history` awaits still resolve, but its `cancelled` closure is true by
        // then, so it bails out before touching the store a second time.
        if (useAgents.getState().chats[panelId]?.items.some((it) => it.type === 'user')) return
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

  const background = () =>
    void window.api
      .invoke('agent:background', panelId)
      .then((r) => {
        if (!r.ok) notify(r.message)
        else if (!r.value) notify('Nada para mandar para segundo plano.')
      })
      .catch((err) => notify(errorText(err)))

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

  /** Resolves false when the switch failed (restartSession already rolled back and reported it). */
  const restart = async (next: AgentPanelParams, history: AgentEvent[] = []): Promise<boolean> => {
    const ok = await restartSession(panelId, next, history, {
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
    const title = panelTitle(currentAgentParams(panelId) ?? next)
    useDock.getState().api?.getPanel(panelId)?.api.setTitle(title)
    useSessions.getState().setTitle(panelId, title)
    return ok
  }

  const base = (): AgentPanelParams => {
    const p = currentAgentParams(panelId) ?? params
    return {
      type: 'agent',
      projectPath: p.projectPath,
      ...(p.model ? { model: p.model } : {}),
      ...(p.permissionMode ? { permissionMode: p.permissionMode } : {}),
      ...(p.effort ? { effort: p.effort } : {}),
      ...(p.additionalDirectories?.length ? { additionalDirectories: p.additionalDirectories } : {}),
    }
  }

  // Stable object for the (memoized) chat cards; the ref always points at the latest closure.
  const newSessionRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    newSessionRef.current = () => void restart(base()).catch(fail)
  })
  const actions = useMemo<ChatActions>(() => ({ newSession: () => newSessionRef.current() }), [])
  const panelCtx = useMemo(() => ({ projectPath: params.projectPath }), [params.projectPath])

  const notify = (message: string) => useAgents.getState().setNotice(panelId, { text: message, command: '' })
  const isBusy = (c: typeof chat) => c.state === 'running' || c.state === 'awaiting_permission'
  const busy = isBusy(chat)
  // Read from the store, not the render closure: a click can land after the state changed.
  const liveChat = () => selectChat(panelId)(useAgents.getState())
  const liveSessionId = () => liveChat().sessionId ?? currentAgentParams(panelId)?.sessionId

  const openRewind = () => {
    if (pendingRef.current) notify(pendingRef.current)
    else if (busy) notify('Pare o agente antes de voltar para uma mensagem anterior.')
    else setRewindOpen(true)
  }

  const runRewindMode = (mode: RewindMode, target: RewindTarget) => {
    setRewindOpen(false)
    if (pendingRef.current) return notify(pendingRef.current)
    if (isBusy(liveChat())) return notify('Pare o agente antes de voltar para uma mensagem anterior.')
    const sessionId = liveSessionId()
    const title = currentAgentParams(panelId)?.title
    setPending('Voltando…')
    notify('Voltando…')
    void runRewind(mode, target, {
      rewindFiles: (id) => window.api.invoke('agent:rewindFiles', panelId, id, false),
      forkBefore: (id) =>
        sessionId
          ? window.api.invoke('agent:forkBefore', params.projectPath, sessionId, id, title)
          : Promise.resolve({ ok: false as const, message: 'Sessão ainda não salva.' }),
      // The fork carries the session's title, so the tab keeps it (a fresh session has none to keep).
      restart: async (next, history) => {
        const ok = await restart({ ...base(), ...(next ? { sessionId: next, ...(title ? { title } : {}) } : {}) }, history)
        if (!ok) throw new Error('a sessão não pôde ser reiniciada.')
      },
      setDraft: (text) => useAgents.getState().setDraft(panelId, text),
    })
      .then(() => (mode === 'code' ? notify('Arquivos restaurados.') : useAgents.getState().setNotice(panelId, null)))
      .catch((err) => notify(`Não foi possível voltar: ${errorText(err)}`))
      .finally(() => setPending(null))
  }

  const renameSession = (title: string) => {
    if (pendingRef.current) return notify(pendingRef.current)
    const sessionId = liveSessionId()
    const hasTranscript = chat.items.some((it) => it.type === 'user')
    if (!title) return notify('Uso: /rename <título>')
    if (!sessionId || !hasTranscript) return notify('Envie uma mensagem antes de renomear a sessão.')
    setPending('Renomeando…')
    void window.api
      .invoke('agent:rename', params.projectPath, sessionId, title)
      .then((r) => {
        if (!r.ok) return notify(r.message)
        // The panel moved to another session meanwhile: the rename applied to the old one only.
        if (liveSessionId() !== sessionId) return
        const clean = cleanTitle(title)
        const current = currentAgentParams(panelId)
        if (current) replacePanelParams(panelId, { ...current, title: clean })
        const tabTitle = panelTitle({ ...(current ?? params), title: clean })
        useDock.getState().api?.getPanel(panelId)?.api.setTitle(tabTitle)
        useSessions.getState().setTitle(panelId, tabTitle)
      })
      .catch((err) => notify(errorText(err)))
      .finally(() => setPending(null))
  }

  const forkSession = (title: string) => {
    if (pendingRef.current) return
    const sessionId = liveSessionId()
    const hasTranscript = liveChat().items.some((it) => it.type === 'user')
    if (!sessionId || !hasTranscript) return notify('Envie uma mensagem antes de copiar a sessão.')
    setPending('Copiando sessão…')
    notify('Copiando sessão…')
    void window.api
      .invoke('agent:fork', params.projectPath, sessionId, title || undefined)
      .then((r) => {
        if (!r.ok) return notify(r.message)
        const current = currentAgentParams(panelId) ?? params
        const clean = title ? cleanTitle(title) : ''
        useDock.getState().openBeside(panelId, {
          type: 'agent',
          projectPath: current.projectPath,
          sessionId: r.value,
          ...(current.model ? { model: current.model } : {}),
          ...(current.permissionMode ? { permissionMode: current.permissionMode } : {}),
          ...(current.effort ? { effort: current.effort } : {}),
          ...(clean ? { title: clean } : {}),
        })
        useAgents.getState().setNotice(panelId, null)
      })
      .catch((err) => notify(errorText(err)))
      .finally(() => setPending(null))
  }

  const setDirs = (dirs: string[]) =>
    void window.api
      .invoke('agent:setDirs', panelId, dirs)
      .then((r) => {
        if (!r.ok) notify(r.message)
      })
      .catch((err) => notify(errorText(err)))

  const addDir = (arg: string) => {
    if (pendingRef.current) return notify(pendingRef.current)
    if (isBusy(liveChat())) return notify('Pare o agente antes de mudar as pastas.')
    const current = liveChat().dirs
    if (arg) return setDirs([...current, arg])
    void window.api
      .invoke('fs:pickFolder')
      .then((picked) => picked.length && setDirs([...current, ...picked]))
      .catch((err) => notify(errorText(err)))
  }

  const removeDir = (dir: string) => {
    if (pendingRef.current) return notify(pendingRef.current)
    if (isBusy(liveChat())) return notify('Pare o agente antes de mudar as pastas.')
    setDirs(liveChat().dirs.filter((d) => d !== dir))
  }

  // Model/effort/mode apply to this chat and become the project's default for new chats.
  const changeModel = (model: string) =>
    void window.api
      .invoke('agent:setModel', panelId, model)
      .then(() => rememberProjectDefault(params.projectPath, { model }))
      .catch((err) => notify(errorText(err)))
  const changeEffort = (effort: EffortLevel | null) =>
    void window.api
      .invoke('agent:setEffort', panelId, effort)
      .then(() => rememberProjectDefault(params.projectPath, { effort }))
      .catch((err) => notify(errorText(err)))
  const changeMode = (mode: PermissionMode) =>
    void window.api
      .invoke('agent:setMode', panelId, mode)
      .then(() => rememberProjectDefault(params.projectPath, { permissionMode: mode }))
      .catch((err) => notify(errorText(err)))
  const cycleMode = () => changeMode(nextMode(liveChat().permissionMode))
  /** A bare /model, /effort or /mode reopens the draft with the argument menu. */
  const askArgument = (name: string) => useAgents.getState().setDraft(panelId, `/${name} `)

  const onLocalCommand = (name: LocalCommand, arg: string) => {
    if (name === 'resume') setResumeOpen(true)
    else if (name === 'clear') void restart(base()).catch(fail)
    else if (name === 'model') {
      if (!arg) askArgument(name)
      else changeModel(arg)
    } else if (name === 'statusline') setStatusConfig(true)
    else if (name === 'context') setContextOpen(true)
    else if (name === 'rewind') openRewind()
    else if (name === 'rename') renameSession(arg)
    else if (name === 'fork') forkSession(arg)
    else if (name === 'mcp') setMcpOpen(true)
    else if (name === 'agents') setAgentsOpen(true)
    else if (name === 'add-dir') addDir(arg)
    else if (name === 'effort') {
      if (!arg) askArgument(name)
      else if (arg === 'auto' || isEffortLevel(arg)) changeEffort(arg === 'auto' ? null : arg)
      else notify(`Esforço inválido: ${arg}. Use low, medium, high, xhigh, max ou auto.`)
    } else if (name === 'mode') {
      const mode = parseMode(arg)
      if (!arg) askArgument(name)
      else if (mode) changeMode(mode)
      else notify(`Modo inválido: ${arg}. Use auto, manual, accept, plan ou bypass.`)
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
      <DirsBar dirs={chat.dirs} onRemove={removeDir} />
      <TasksBar panelId={panelId} tasks={chat.tasks} />
      {btw && <BtwCard btw={btw} onClose={closeBtw} />}
      <Composer
        panelId={panelId}
        chat={chat}
        projectPath={params.projectPath}
        onSend={send}
        onLocalCommand={onLocalCommand}
        onBtw={askBtw}
        onEscape={closeBtw}
        onRewind={openRewind}
        onBackground={background}
        onCycleMode={cycleMode}
        blocked={pending !== null}
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
      {contextOpen && <ContextModal panelId={panelId} onClose={() => setContextOpen(false)} />}
      {rewindOpen && <RewindModal panelId={panelId} targets={rewindTargets(chat.items)} onRun={runRewindMode} onClose={() => setRewindOpen(false)} />}
      {mcpOpen && <McpModal panelId={panelId} projectPath={params.projectPath} onClose={() => setMcpOpen(false)} />}
      {agentsOpen && <AgentsModal panelId={panelId} projectPath={params.projectPath} onClose={() => setAgentsOpen(false)} />}
    </div>
  )
}
