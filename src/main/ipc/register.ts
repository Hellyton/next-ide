import { INVOKE_CHANNELS, type Handlers } from '@shared/ipc-contract'

export type IpcMainLike = {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void
}

export function registerHandlers(ipc: IpcMainLike, handlers: Handlers): void {
  for (const channel of INVOKE_CHANNELS) {
    const fn = handlers[channel] as (...args: unknown[]) => unknown
    ipc.handle(channel, (_event, ...args) => fn(...args))
  }
}
