import type { GitFileStatus } from './files'

export type GitChange = { path: string; status: GitFileStatus }

/** Everything the Git panel and the status line chip show about a project's repository. */
export type GitOverview = {
  /** Branch name, `@<sha>` when detached, null outside a repository. */
  branch: string | null
  /** e.g. `origin/dev`; null when the branch was never pushed. */
  upstream: string | null
  ahead: number
  behind: number
  changes: GitChange[]
}

export type GitBranches = {
  current: string | null
  local: string[]
  /** Remote branches (`origin/x`) that have no local branch of the same name yet. */
  remote: string[]
}

export type GitCheckout = { kind: 'existing' | 'create'; name: string }
export type GitSyncAction = 'fetch' | 'pull' | 'push'

/** What the single sync button does next, like GitHub Desktop's: pull first, then push, otherwise fetch. */
export function nextSync(o: Pick<GitOverview, 'branch' | 'upstream' | 'ahead' | 'behind'>): GitSyncAction {
  if (o.behind > 0) return 'pull'
  if (o.ahead > 0 || (o.branch !== null && !o.branch.startsWith('@') && o.upstream === null)) return 'push'
  return 'fetch'
}

/** A name git accepts as a branch and that can never be read as a command-line option. */
export const isBranchName = (name: string): boolean =>
  name.length > 0 && name.length < 200 && !name.startsWith('-') && !/[\s~^:?*[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|^\/|\/$|\.lock$|\.$/.test(name)

/** Project-relative path with no way out of the project. */
export const isRepoPath = (path: string): boolean =>
  path.length > 0 && !path.startsWith('/') && !path.includes('\0') && !path.split('/').includes('..')

export type DiffLine = { kind: 'add' | 'del' | 'hunk' | 'ctx'; text: string }

/** Unified diff body without the file header; a binary or empty diff yields no lines. */
export function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n')
  const start = lines.findIndex((l) => l.startsWith('@@'))
  if (start === -1) return []
  const out: DiffLine[] = []
  for (const line of lines.slice(start)) {
    if (line.startsWith('@@')) out.push({ kind: 'hunk', text: line })
    else if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1) })
    else if (line.startsWith(' ')) out.push({ kind: 'ctx', text: line.slice(1) })
  }
  return out
}
