import type { TerminalPanelParams } from '@shared/models'

/** Drops `initialCommand` so a restored/re-serialized panel never replays it again. */
export function withoutInitialCommand(params: TerminalPanelParams): TerminalPanelParams {
  const { initialCommand: _initialCommand, ...rest } = params
  return rest
}
