import { diffLines } from 'diff'

export type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string }
export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null
const splitLines = (value: string): string[] => {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function editDiff(oldText: string, newText: string): DiffLine[] {
  return diffLines(oldText, newText).flatMap((part) =>
    splitLines(part.value).map((text): DiffLine => ({ kind: part.added ? 'add' : part.removed ? 'del' : 'ctx', text })),
  )
}

export function toolDiff(name: string, input: unknown): { filePath: string; lines: DiffLine[] } | null {
  if (!isRec(input) || typeof input.file_path !== 'string') return null
  const filePath = input.file_path
  if (name === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return { filePath, lines: editDiff(input.old_string, input.new_string) }
  }
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    const chunks = input.edits
      .filter((e): e is Rec => isRec(e) && typeof e.old_string === 'string' && typeof e.new_string === 'string')
      .map((e) => editDiff(e.old_string as string, e.new_string as string))
    return { filePath, lines: chunks.flatMap((chunk, i) => (i === 0 ? chunk : [{ kind: 'ctx' as const, text: '⋯' }, ...chunk])) }
  }
  if (name === 'Write' && typeof input.content === 'string') {
    return { filePath, lines: splitLines(input.content).map((text) => ({ kind: 'add' as const, text })) }
  }
  return null
}

export function toolTodos(input: unknown): Todo[] | null {
  if (!isRec(input) || !Array.isArray(input.todos)) return null
  return input.todos
    .filter((t): t is Rec => isRec(t) && typeof t.content === 'string')
    .map((t) => ({
      content: t.content as string,
      status: t.status === 'completed' || t.status === 'in_progress' ? t.status : 'pending',
    }))
}

const QUIET = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch'])
export const isQuietTool = (name: string): boolean => QUIET.has(name)
