import type { AddPanelOptions } from 'dockview-react'
import type { PanelParams, PanelType } from '@shared/models'
import { basename } from '@shared/workspaces'

export function panelTitle(p: PanelParams): string {
  if (p.type === 'file') return basename(p.filePath)
  if (p.type === 'agent') return `${p.title ?? basename(p.projectPath)} · claude`
  return `${basename(p.projectPath)} · zsh`
}

export function newPanelId(type: PanelType, uuid: () => string = () => crypto.randomUUID()): string {
  return `${type}-${uuid()}`
}

export type Placement =
  | { kind: 'activeGroup'; groupId?: string }
  | { kind: 'split'; referencePanelId: string; direction: 'right' | 'below' }

export function buildAddPanelOptions(params: PanelParams, id: string, placement: Placement): AddPanelOptions<PanelParams> {
  // `base` is intentionally left untyped here: annotating it as `AddPanelOptions<PanelParams>`
  // pulls in dockview's merged (non-distributive) `floating`/`position` union fields, which then
  // makes the spreads below fail to narrow to either `AddPanelPositionUnion` branch. Casting the
  // final literal instead keeps runtime behavior identical to the brief.
  const base = {
    id,
    component: params.type,
    title: panelTitle(params),
    params,
    renderer: 'always' as const,
  }
  if (placement.kind === 'split') {
    return {
      ...base,
      position: { referencePanel: placement.referencePanelId, direction: placement.direction },
    } as AddPanelOptions<PanelParams>
  }
  return (placement.groupId ? { ...base, position: { referenceGroup: placement.groupId } } : base) as AddPanelOptions<PanelParams>
}
