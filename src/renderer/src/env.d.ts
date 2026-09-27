import type { NextIdeApi } from '@shared/ipc-contract'
import type { BuildInfo } from './sidebar/buildInfo'

declare global {
  const __BUILD_INFO__: BuildInfo
  interface Window {
    api: NextIdeApi
  }
}

export {}
