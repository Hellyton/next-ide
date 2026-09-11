import type { NextIdeApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: NextIdeApi
  }
}

export {}
