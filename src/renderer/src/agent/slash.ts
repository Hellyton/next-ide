import type { CommandOption } from '@shared/agent'

export type SlashItem = { name: string; description: string; argumentHint: string; local: boolean }
export type LocalCommand = 'resume' | 'clear' | 'model' | 'statusline'
export type SlashAction =
  | { kind: 'local'; name: LocalCommand }
  | { kind: 'btw'; question: string }
  | { kind: 'tui'; name: string }
  | { kind: 'send' }

export const LOCAL_COMMANDS: SlashItem[] = [
  { name: 'resume', description: 'Retomar uma sessão anterior deste projeto', argumentHint: '', local: true },
  { name: 'clear', description: 'Começar uma conversa nova neste painel', argumentHint: '', local: true },
  { name: 'model', description: 'Trocar o modelo', argumentHint: '', local: true },
  { name: 'statusline', description: 'Configurar a barra de status', argumentHint: '', local: true },
  { name: 'btw', description: 'Pergunta rápida paralela, sem entrar na conversa', argumentHint: '<pergunta>', local: true },
]

const LOCAL_NAMES = new Set<string>(LOCAL_COMMANDS.map((c) => c.name))
const BTW = /^\/btw(?:\s+([\s\S]*))?$/
const TUI_ONLY = new Set([
  'login', 'logout', 'mcp', 'config', 'usage', 'doctor', 'permissions', 'hooks',
  'agents', 'ide', 'vim', 'terminal-setup', 'upgrade', 'status', 'bug',
])

export function slashQuery(text: string): string | null {
  const match = /^\/(\S*)$/.exec(text)
  return match ? match[1]! : null
}

export function mergeCommands(sdk: CommandOption[], initNames: string[]): SlashItem[] {
  const seen = new Set(LOCAL_NAMES)
  const out: SlashItem[] = [...LOCAL_COMMANDS]
  for (const c of sdk) {
    if (seen.has(c.name)) continue
    seen.add(c.name)
    out.push({ ...c, local: false })
  }
  for (const name of initNames) {
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ name, description: '', argumentHint: '', local: false })
  }
  return out
}

export function filterCommands(items: SlashItem[], query: string): SlashItem[] {
  const q = query.toLowerCase()
  const prefix = items.filter((c) => c.name.toLowerCase().startsWith(q))
  const rest = items.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q))
  return [...prefix, ...rest].slice(0, 8)
}

export function classifySlash(text: string): SlashAction {
  const btw = BTW.exec(text.trim())
  if (btw) return { kind: 'btw', question: (btw[1] ?? '').trim() }
  const match = /^\/(\S+)$/.exec(text.trim())
  if (!match) return { kind: 'send' }
  const name = match[1]!
  if (LOCAL_NAMES.has(name)) return { kind: 'local', name: name as LocalCommand }
  if (TUI_ONLY.has(name)) return { kind: 'tui', name }
  return { kind: 'send' }
}
