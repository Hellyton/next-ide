import type { CommandOption, ModelOption } from '@shared/agent'
import { EFFORT_LEVELS } from '@shared/models'
import { MODE_OPTIONS } from './permissions'

export type SlashItem = { name: string; description: string; argumentHint: string; local: boolean }
export type LocalCommand = 'resume' | 'clear' | 'model' | 'statusline' | 'rewind' | 'context' | 'effort' | 'mode' | 'rename' | 'fork' | 'mcp' | 'agents' | 'add-dir'
export type SlashAction =
  | { kind: 'local'; name: LocalCommand; arg: string }
  | { kind: 'btw'; question: string }
  | { kind: 'tui'; name: string }
  | { kind: 'send' }

export const LOCAL_COMMANDS: SlashItem[] = [
  { name: 'resume', description: 'Retomar uma sessão anterior deste projeto', argumentHint: '', local: true },
  { name: 'clear', description: 'Começar uma conversa nova neste painel', argumentHint: '', local: true },
  { name: 'model', description: 'Trocar o modelo', argumentHint: '<modelo>', local: true },
  { name: 'statusline', description: 'Configurar a barra de status', argumentHint: '', local: true },
  { name: 'btw', description: 'Pergunta rápida paralela, sem entrar na conversa', argumentHint: '<pergunta>', local: true },
  { name: 'rewind', description: 'Voltar código e/ou conversa a uma mensagem anterior', argumentHint: '', local: true },
  { name: 'context', description: 'Ver o uso do contexto', argumentHint: '', local: true },
  { name: 'effort', description: 'Nível de esforço do modelo', argumentHint: '[low|medium|high|xhigh|max|auto]', local: true },
  { name: 'mode', description: 'Modo de permissão (Shift+Tab alterna)', argumentHint: '[auto|manual|accept|plan|bypass]', local: true },
  { name: 'rename', description: 'Renomear esta sessão', argumentHint: '<título>', local: true },
  { name: 'fork', description: 'Copiar esta conversa para um painel novo ao lado', argumentHint: '[título]', local: true },
  { name: 'mcp', description: 'Servidores MCP: status, ligar/desligar, reconectar', argumentHint: '', local: true },
  { name: 'agents', description: 'Subagentes disponíveis', argumentHint: '', local: true },
  { name: 'add-dir', description: 'Dar acesso a outra pasta', argumentHint: '[caminho]', local: true },
]

const LOCAL_NAMES = new Set<string>(LOCAL_COMMANDS.map((c) => c.name))
const BTW = /^\/btw(?:\s+([\s\S]*))?$/
const TUI_ONLY = new Set([
  'login', 'logout', 'config', 'usage', 'doctor', 'permissions', 'hooks',
  'ide', 'vim', 'terminal-setup', 'upgrade', 'status', 'bug',
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
  return [...prefix, ...rest].slice(0, 50)
}

export function classifySlash(text: string): SlashAction {
  const btw = BTW.exec(text.trim())
  if (btw) return { kind: 'btw', question: (btw[1] ?? '').trim() }
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return { kind: 'send' }
  const name = match[1]!
  const arg = (match[2] ?? '').trim()
  if (LOCAL_NAMES.has(name)) return { kind: 'local', name: name as LocalCommand, arg }
  if (!arg && TUI_ONLY.has(name)) return { kind: 'tui', name }
  return { kind: 'send' }
}

/** Commands whose argument the menu completes. */
export type ArgCommand = 'model' | 'effort' | 'mode'
const ARG_COMMANDS = new Set<string>(['model', 'effort', 'mode'])

/** "/effort hi" → { command: 'effort', query: 'hi' } while the argument is being typed. */
export function argQuery(text: string): { command: ArgCommand; query: string } | null {
  const match = /^\/(\S+) (\S*)$/.exec(text)
  if (!match || !ARG_COMMANDS.has(match[1]!)) return null
  return { command: match[1] as ArgCommand, query: match[2]! }
}

const EFFORT_LABEL: Record<string, string> = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo', auto: 'automático' }

/** Menu items for a command's argument; each item's name is "<command> <value>", like a full command line. */
export function argItems(command: ArgCommand, query: string, models: ModelOption[]): SlashItem[] {
  const options: Array<{ value: string; description: string }> =
    command === 'effort'
      ? [...EFFORT_LEVELS, 'auto'].map((v) => ({ value: v, description: `esforço ${EFFORT_LABEL[v]}` }))
      : command === 'mode'
        ? MODE_OPTIONS.map((m) => ({ value: m.alias, description: m.label }))
        : models.map((m) => ({ value: m.value, description: m.displayName }))
  const q = query.toLowerCase()
  const matches = (o: { value: string; description: string }) => o.value.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)
  return options.filter(matches).map((o) => ({ name: `${command} ${o.value}`, description: o.description, argumentHint: '', local: false }))
}
