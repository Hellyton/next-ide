import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type NextIdeApi } from '@shared/ipc-contract'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

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
}

contextBridge.exposeInMainWorld('api', api)
