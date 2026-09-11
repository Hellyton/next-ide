import { isUnder } from '../files/tree'

export type FileTarget = { path: string; line?: number }
type Rec = Record<string, unknown>

function normalize(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `/${out.join('/')}`
}

export const resolveToolPath = (projectPath: string, p: string): string => normalize(p.startsWith('/') ? p : `${projectPath}/${p}`)

export function toolFileTarget(name: string, input: unknown): FileTarget | null {
  if (typeof input !== 'object' || input === null) return null
  const rec = input as Rec
  const path = typeof rec.file_path === 'string' ? rec.file_path : typeof rec.notebook_path === 'string' ? rec.notebook_path : null
  if (!path) return null
  if (name === 'Read' && typeof rec.offset === 'number' && rec.offset > 0) return { path, line: rec.offset }
  return { path }
}

/** One line of Grep/Glob output: `path:line:text` (grep -n) or a bare path (file lists). */
export function parseToolOutputLine(line: string): FileTarget | null {
  const withLine = /^([^\s:][^:]*?):(\d+):/.exec(line)
  if (withLine) return { path: withLine[1]!, line: Number(withLine[2]) }
  if (!line || /\s/.test(line) || line.includes(':')) return null
  if (/-\d+-/.test(line)) return null // grep context line (`path-12-text`), not a file name
  return /[/.]/.test(line) ? { path: line } : null
}

export function projectForPath(roots: string[], path: string): string | null {
  return roots.filter((r) => isUnder(path, r)).sort((a, b) => b.length - a.length)[0] ?? null
}
