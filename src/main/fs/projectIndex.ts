import { execFile } from 'node:child_process'
import { relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { GitFileStatus } from '@shared/files'
import { listDir, loadIgnore } from './fsOps'

const exec = promisify(execFile)
const toPosix = (p: string) => p.split(sep).join('/')

export async function indexProject(root: string, limit = 20_000): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout.split('\0').filter(Boolean).slice(0, limit)
  } catch {
    const ig = await loadIgnore(root)
    const out: string[] = []
    const queue = [root]
    while (queue.length > 0 && out.length < limit) {
      const dir = queue.shift()!
      let entries
      try {
        entries = await listDir(dir, root, ig)
      } catch {
        continue
      }
      for (const e of entries) {
        if (e.kind === 'dir') queue.push(e.path)
        else if (out.length < limit) out.push(toPosix(relative(root, e.path)))
      }
    }
    return out
  }
}

export function parsePorcelainZ(out: string): Record<string, GitFileStatus> {
  const entries = out.split('\0')
  const result: Record<string, GitFileStatus> = {}
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.length < 4) continue
    const x = entry[0]!
    const y = entry[1]!
    const path = entry.slice(3)
    if (x === 'R' || x === 'C') i++ // the next entry is the original path
    if (x === '?' && y === '?') result[path] = 'U'
    else if (x === 'R') result[path] = 'R'
    else if (x === 'A' || y === 'A') result[path] = 'A'
    else if (x === 'D' || y === 'D') result[path] = 'D'
    else result[path] = 'M'
  }
  return result
}

/** '' at the repo root, e.g. 'pkg/' when `root` is a subfolder of the repo. */
async function gitPrefix(root: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['--no-optional-locks', 'rev-parse', '--show-prefix'], { cwd: root, timeout: 10_000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function gitStatus(root: string): Promise<Record<string, GitFileStatus>> {
  try {
    const [{ stdout }, prefix] = await Promise.all([
      // --no-optional-locks: never takes the index lock or rewrites .git/index.
      exec('git', ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
        cwd: root,
        timeout: 10_000,
        maxBuffer: 16 * 1024 * 1024,
      }),
      gitPrefix(root),
    ])
    const all = parsePorcelainZ(stdout)
    if (!prefix) return all
    // Porcelain paths are repo-relative; keep only this project's files, stripped to project-relative.
    const result: Record<string, GitFileStatus> = {}
    for (const [path, status] of Object.entries(all)) {
      if (path.startsWith(prefix)) result[path.slice(prefix.length)] = status
    }
    return result
  } catch {
    return {}
  }
}
