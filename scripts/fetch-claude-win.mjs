// npm only installs the Claude Agent SDK's native CLI package for the machine it runs on. A Windows
// build made on Linux/macOS needs @anthropic-ai/claude-agent-sdk-win32-x64 too (same version as the
// SDK), so fetch it when it is missing. On Windows npm already installed it.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const name = '@anthropic-ai/claude-agent-sdk-win32-x64'
const target = join(root, 'node_modules', ...name.split('/'))
if (existsSync(join(target, 'package.json'))) process.exit(0)

const { version } = JSON.parse(readFileSync(join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json'), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'claude-win-'))
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const tarball = execFileSync(npm, ['pack', `${name}@${version}`, '--silent'], { cwd: work, encoding: 'utf8', shell: process.platform === 'win32' }).trim().split('\n').pop()
  mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', join(work, tarball), '-C', target, '--strip-components=1'])
  console.log(`[next-ide] fetched ${name}@${version}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
