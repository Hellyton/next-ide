import type { PanelParams } from '@shared/models'
import { formatMention, pickAgentPanel, type AgentCandidate, type LineRange } from '../agent/mentions'
import { useAgents } from '../stores/agentStore'
import { useDock } from './dockStore'

export function mentionInAgent(projectPath: string, filePath: string, range: LineRange | null): void {
  const dock = useDock.getState()
  if (!dock.api) return
  const candidates: AgentCandidate[] = dock.api.panels.flatMap((p) => {
    const params = p.params as PanelParams | undefined
    return params?.type === 'agent' ? [{ id: p.id, projectPath: params.projectPath, visible: p.api.isVisible }] : []
  })
  const id = pickAgentPanel(candidates, projectPath, dock.lastAgent[projectPath]) ?? dock.open({ type: 'agent', projectPath })
  if (!id) return
  useAgents.getState().insertIntoDraft(id, formatMention(projectPath, filePath, range))
  dock.focus(id)
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-composer="${CSS.escape(id)}"]`)
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
}
