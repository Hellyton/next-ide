import type { PermissionDecision } from '@shared/agent'
import type { PermissionMode } from '@shared/models'

/**
 * Same wording, glyph and color as the Claude Code CLI's shift+tab indicator. `alias` is what
 * `/mode <alias>` takes.
 */
export const MODE_OPTIONS: Array<{ value: PermissionMode; label: string; icon: string; color: string; alias: string }> = [
  { value: 'auto', label: 'auto mode on', icon: '⏵⏵', color: 'rgb(255,193,7)', alias: 'auto' },
  { value: 'default', label: 'manual mode on', icon: '', color: 'rgb(153,153,153)', alias: 'manual' },
  { value: 'acceptEdits', label: 'accept edits on', icon: '⏵⏵', color: 'rgb(175,135,255)', alias: 'accept' },
  { value: 'plan', label: 'plan mode on', icon: '⏸', color: 'rgb(72,150,140)', alias: 'plan' },
  { value: 'bypassPermissions', label: 'bypass permissions on', icon: '⏵⏵', color: 'rgb(255,107,128)', alias: 'bypass' },
]

export const modeOption = (mode: PermissionMode | undefined) => MODE_OPTIONS.find((m) => m.value === (mode ?? 'default')) ?? MODE_OPTIONS[1]!

/** `/mode` argument: the alias or the SDK name. */
export function parseMode(arg: string): PermissionMode | null {
  const a = arg.trim().toLowerCase()
  return MODE_OPTIONS.find((m) => m.alias === a || m.value.toLowerCase() === a)?.value ?? null
}

/** Shift+Tab, in the CLI's order. Bypass is left out of the cycle (only `/mode bypass` turns it on). */
const CYCLE: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto']
export function nextMode(mode: PermissionMode | undefined): PermissionMode {
  const i = CYCLE.indexOf(mode ?? 'default')
  return CYCLE[(i + 1) % CYCLE.length]!
}

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
