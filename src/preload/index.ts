import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type NextIdeApi } from '@shared/ipc-contract'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

// Many project rows subscribe `git:changed` and many file panels subscribe `fs:changed`;
// past Node's default of 10 listeners per channel that's expected, not a leak.
ipcRenderer.setMaxListeners(0)

const api: NextIdeApi = {
  invoke: (channel, ...args) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`blocked channel ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, listener) => {
    if (!eventAllowed.has(channel)) throw new Error(`blocked channel ${channel}`)
    const wrapped = (_e: IpcRendererEvent, ...args: unknown[]) => (listener as (...a: unknown[]) => void)(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  // Dropped/picked files no longer carry `.path` (Electron 32+): this is the supported way.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
