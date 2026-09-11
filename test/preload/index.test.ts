import { beforeEach, describe, expect, it, vi } from 'vitest'

const setMaxListeners = vi.fn()
const exposeInMainWorld = vi.fn()
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn(), setMaxListeners },
}))

describe('preload', () => {
  beforeEach(() => {
    vi.resetModules()
    setMaxListeners.mockReset()
    exposeInMainWorld.mockReset()
  })

  it('raises ipcRenderer max listeners so many project rows/panels do not warn', async () => {
    await import('../../src/preload/index')
    expect(setMaxListeners).toHaveBeenCalledWith(0)
    expect(exposeInMainWorld).toHaveBeenCalledWith('api', expect.anything())
  })
})
