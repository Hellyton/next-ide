import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Outcome } from '@shared/agent'
import { isBranchName, isRepoPath, type GitBranches, type GitCheckout, type GitOverview, type GitSyncAction } from '@shared/git'
import { gitStatus } from '../fs/projectIndex'
import { gitInfo } from './gitInfo'

const exec = promisify(execFile)

const LOCAL_MS = 15_000
const NETWORK_MS = 120_000
const MAX_DIFF_BYTES = 2 * 1024 * 1024

// Never wait on a terminal: a missing credential or a merge message must fail, not hang.
const ENV = { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' }

type ExecError = { stdout?: string; stderr?: string; message?: string }
/** Git explains itself on stderr; the last lines are the part worth showing. */
const reason = (err: unknown): string => {
  const e = err as ExecError
  const text = (e.stderr || e.stdout || e.message || String(err)).trim()
  return text.split('\n').slice(-6).join('\n')
}
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })
const failed = (err: unknown): Outcome<never> => ({ ok: false, message: reason(err) })

/**
 * Git actions the renderer can ask for (branch switch, commit, sync). Only workspace project
 * folders are accepted, and every branch/path argument is validated before it reaches git.
 */
export class GitService {
  constructor(private readonly roots: () => Promise<string[]>) {}

  private async run(projectPath: string, args: string[], timeout = LOCAL_MS): Promise<string> {
    if (!(await this.roots()).includes(projectPath)) throw new Error('Pasta fora dos workspaces.')
    const { stdout } = await exec('git', args, { cwd: projectPath, timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...ENV } })
    return stdout
  }

  async overview(projectPath: string): Promise<GitOverview> {
    const empty: GitOverview = { branch: null, upstream: null, ahead: 0, behind: 0, changes: [] }
    if (!(await this.roots()).includes(projectPath)) return empty
    const [{ branch }, status] = await Promise.all([gitInfo(projectPath), gitStatus(projectPath)])
    if (branch === null) return empty
    const changes = Object.entries(status)
      .map(([path, s]) => ({ path, status: s }))
      .sort((a, b) => a.path.localeCompare(b.path))
    try {
      const upstream = (await this.run(projectPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim()
      const [behind, ahead] = (await this.run(projectPath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])).trim().split(/\s+/).map(Number)
      return { branch, upstream, ahead: ahead || 0, behind: behind || 0, changes }
    } catch {
      // No upstream (never pushed, or detached HEAD).
      return { ...empty, branch, changes }
    }
  }

  async branches(projectPath: string): Promise<GitBranches> {
    try {
      const out = await this.run(projectPath, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/heads', 'refs/remotes'])
      const refs = out.split('\n').filter(Boolean)
      const local = refs.filter((r) => r.startsWith('refs/heads/')).map((r) => r.slice('refs/heads/'.length))
      const known = new Set(local)
      const remote = refs
        .filter((r) => r.startsWith('refs/remotes/'))
        .map((r) => r.slice('refs/remotes/'.length))
        .filter((r) => !r.endsWith('/HEAD') && !known.has(r.slice(r.indexOf('/') + 1)))
      const current = (await this.run(projectPath, ['branch', '--show-current'])).trim() || null
      return { current, local, remote }
    } catch {
      return { current: null, local: [], remote: [] }
    }
  }

  /** Git itself refuses when local changes would be overwritten; that message goes back as is. */
  async checkout(projectPath: string, target: GitCheckout): Promise<Outcome<null>> {
    if (!isBranchName(target.name)) return { ok: false, message: 'Nome de branch inválido.' }
    try {
      if (target.kind === 'create') await this.run(projectPath, ['switch', '-c', target.name])
      else {
        const { local } = await this.branches(projectPath)
        // A remote-only branch (origin/x) gets a local branch tracking it.
        await this.run(projectPath, local.includes(target.name) ? ['switch', target.name] : ['switch', '--track', target.name])
      }
      return ok(null)
    } catch (err) {
      return failed(err)
    }
  }

  /** Working tree against the last commit, so staged and unstaged edits show together. */
  async diff(projectPath: string, path: string): Promise<Outcome<string>> {
    if (!isRepoPath(path)) return { ok: false, message: 'Caminho inválido.' }
    try {
      let out = await this.run(projectPath, ['--no-optional-locks', 'diff', '--no-color', 'HEAD', '--', path]).catch(() => '')
      // Untracked files (and a repo with no commit yet) have nothing to compare with: show them as all-new.
      if (!out) out = await this.run(projectPath, ['--no-optional-locks', 'diff', '--no-color', '--no-index', '--', '/dev/null', path]).catch((err) => (err as ExecError).stdout ?? '')
      return ok(out.length > MAX_DIFF_BYTES ? '' : out)
    } catch (err) {
      return failed(err)
    }
  }

  /** Commits exactly `paths` as they are on disk, whatever else happens to be staged. */
  async commit(projectPath: string, paths: string[], summary: string, description: string): Promise<Outcome<null>> {
    const title = summary.trim()
    if (!title) return { ok: false, message: 'Escreva um resumo para o commit.' }
    if (paths.length === 0) return { ok: false, message: 'Selecione ao menos um arquivo.' }
    if (!paths.every(isRepoPath)) return { ok: false, message: 'Caminho inválido.' }
    try {
      await this.run(projectPath, ['add', '-A', '--', ...paths])
      const body = description.trim()
      await this.run(projectPath, ['commit', '-m', title, ...(body ? ['-m', body] : []), '--only', '--', ...paths], NETWORK_MS)
      return ok(null)
    } catch (err) {
      return failed(err)
    }
  }

  async sync(projectPath: string, action: GitSyncAction): Promise<Outcome<null>> {
    try {
      if (action === 'fetch') await this.run(projectPath, ['fetch', '--prune'], NETWORK_MS)
      else if (action === 'pull') await this.run(projectPath, ['pull', '--no-rebase'], NETWORK_MS)
      else {
        const { branch, upstream } = await this.overview(projectPath)
        if (!branch || branch.startsWith('@')) return { ok: false, message: 'Não há branch para enviar (HEAD solto).' }
        // First push of a branch publishes it and starts tracking.
        await this.run(projectPath, upstream ? ['push'] : ['push', '-u', 'origin', branch], NETWORK_MS)
      }
      return ok(null)
    } catch (err) {
      return failed(err)
    }
  }
}
