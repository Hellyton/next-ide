import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitInfo } from '@shared/models'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, timeout: 3000 })
  return stdout.trim()
}

export async function gitInfo(cwd: string): Promise<GitInfo> {
  try {
    const branch = await git(cwd, ['branch', '--show-current'])
    if (branch) return { branch }
    return { branch: `@${await git(cwd, ['rev-parse', '--short', 'HEAD'])}` }
  } catch {
    return { branch: null }
  }
}
