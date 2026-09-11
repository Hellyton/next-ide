import type { PanelType, SessionState } from '@shared/models'

export const CLOSE_CONFIRM_MESSAGE = 'O agente está trabalhando. Fechar mesmo assim?'

export function needsCloseConfirm(type: PanelType | undefined, state: SessionState | undefined): boolean {
  return type === 'agent' && (state === 'running' || state === 'awaiting_permission')
}
