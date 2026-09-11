import type { SessionState } from '@shared/models'

const CLASSES: Record<SessionState, string> = {
  starting: 'bg-neutral-400',
  idle: 'bg-neutral-500',
  running: 'bg-blue-500 animate-pulse',
  awaiting_permission: 'bg-orange-500',
  error: 'bg-red-500',
  exited: 'bg-neutral-700',
}

export function stateDotClass(state: SessionState): string {
  return `inline-block h-2 w-2 shrink-0 rounded-full ${CLASSES[state]}`
}
