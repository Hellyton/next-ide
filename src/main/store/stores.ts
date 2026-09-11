import { join } from 'node:path'
import { DEFAULT_SETTINGS, type LayoutState, type Settings, type Workspace } from '@shared/models'
import { JsonFile } from './JsonFile'

export type Stores = {
  workspaces: JsonFile<Workspace[]>
  settings: JsonFile<Settings>
  layout: JsonFile<LayoutState | null>
}

export function createStores(dir: string): Stores {
  return {
    workspaces: new JsonFile<Workspace[]>(join(dir, 'workspaces.json'), () => []),
    settings: new JsonFile<Settings>(join(dir, 'settings.json'), () => DEFAULT_SETTINGS),
    layout: new JsonFile<LayoutState | null>(join(dir, 'layout.json'), () => null),
  }
}
