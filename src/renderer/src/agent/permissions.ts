import type { PermissionDecision } from '@shared/agent'
import type { PermissionMode } from '@shared/models'

export const MODE_OPTIONS: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Perguntar' },
  { value: 'acceptEdits', label: 'Aceitar edições' },
  { value: 'plan', label: 'Plano' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Sem permissões' },
]

export function permissionSummary(_toolName: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const rec = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern']) {
    if (typeof rec[key] === 'string') return rec[key] as string
  }
  return JSON.stringify(input)
}

const LABELS: Record<PermissionDecision | 'cancelled', string> = {
  allow: 'Permitido',
  'allow-always': 'Sempre permitido',
  deny: 'Negado',
  cancelled: 'Cancelado',
}
export const decisionLabel = (decision: PermissionDecision | 'cancelled'): string => LABELS[decision]
