import { SearchAddon } from '@xterm/addon-search'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useSessions } from '../../stores/sessionsStore'

export type TerminalEntry = { term: Terminal; host: HTMLDivElement; search: SearchAddon; fit(): void; restart(): void }

type InternalEntry = TerminalEntry & { dispose(): void }

// Terminals live outside React so moving a panel between dock groups never kills the shell.
const entries = new Map<string, InternalEntry>()

export function attachTerminal(panelId: string, cwd: string, container: HTMLElement, initialCommand?: string): TerminalEntry {
  const existing = entries.get(panelId)
  if (existing) {
    container.appendChild(existing.host)
    return existing
  }

  const host = document.createElement('div')
  host.style.width = '100%'
  host.style.height = '100%'
  container.appendChild(host)

  const term = new Terminal({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 10_000,
    theme: { background: '#0a0a0a' },
    allowProposedApi: true,
  })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank')))
  const search = new SearchAddon()
  term.loadAddon(search)
  term.open(host)

  let cols = term.cols
  let rows = term.rows
  const fit = () => {
    if (host.offsetWidth === 0 || host.offsetHeight === 0) return
    try {
      fitAddon.fit()
    } catch {
      return
    }
    if (term.cols !== cols || term.rows !== rows) {
      cols = term.cols
      rows = term.rows
      void window.api
        .invoke('pty:resize', panelId, cols, rows)
        .catch((err) => console.error('[next-ide] pty ipc failed', panelId, err))
    }
  }

  const offData = window.api.on('pty:data', (id, chunk) => {
    if (id === panelId) term.write(chunk)
  })
  const offExit = window.api.on('pty:exit', (id, code) => {
    if (id !== panelId) return
    term.write(`\r\n\x1b[2m[processo encerrado: ${code}]\x1b[0m\r\n`)
    useSessions.getState().setState(panelId, 'exited')
  })
  const input = term.onData(
    (data) =>
      void window.api
        .invoke('pty:write', panelId, data)
        .catch((err) => console.error('[next-ide] pty ipc failed', panelId, err)),
  )
  const spawn = (command?: string) =>
    window.api
      .invoke('pty:create', panelId, cwd, term.cols, term.rows)
      .then(() => {
        if (command) return window.api.invoke('pty:write', panelId, `${command}\r`)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        term.write(`\r\n\x1b[31m[falha ao iniciar o terminal: ${message}]\x1b[0m\r\n`)
        useSessions.getState().setState(panelId, 'error')
      })
  void spawn(initialCommand)

  const entry: InternalEntry = {
    term,
    host,
    search,
    restart: () => {
      term.write('\r\n\x1b[2m[reiniciando…]\x1b[0m\r\n')
      useSessions.getState().setState(panelId, 'idle')
      void spawn()
    },
    fit,
    dispose: () => {
      input.dispose()
      offData()
      offExit()
      void window.api.invoke('pty:kill', panelId).catch((err) => console.error('[next-ide] pty ipc failed', panelId, err))
      term.dispose()
      host.remove()
      entries.delete(panelId)
    },
  }
  entries.set(panelId, entry)
  return entry
}

export function disposeTerminal(panelId: string): void {
  entries.get(panelId)?.dispose()
}
