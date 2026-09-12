export type OutputLineKind = 'error' | 'warn' | 'ok' | 'path' | undefined

const ERROR = /\b(error|erro|fatal|failed|failure|exception|denied|not found|cannot|refused)\b|^\s*[✗✘×]|exit(?:=| code )[1-9]/i
const WARN = /\b(warn|warning|aviso|deprecated|skipped)\b|^\s*[⚠▲]/i
const OK = /\b(ok|success|passed|done|built|created|installed)\b|^\s*[✓✔]|exit(?:=| code )0\b/i

/** Colors plain (ANSI-less) command output the way a terminal theme would. */
export function classifyOutputLine(line: string): OutputLineKind {
  if (!line.trim()) return undefined
  if (ERROR.test(line)) return 'error'
  if (WARN.test(line)) return 'warn'
  if (OK.test(line)) return 'ok'
  // Diff/status style listings: "M path", "?? path", "+12 -3".
  if (/^\s*(M|A|D|R|U|\?\?)\s+\S/.test(line) || /^\s*[+-]\d+/.test(line)) return 'path'
  return undefined
}
