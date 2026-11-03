// npm only installs koffi's native package for the machine it runs on. The Intel (x64) build
// needs @koromix/koffi-darwin-x64 too, so fetch it (same version as koffi) when it is missing.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'node_modules', '@koromix', 'koffi-darwin-x64')
if (process.platform !== 'darwin' || existsSync(join(target, 'package.json'))) process.exit(0)

const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'koffi', 'package.json'), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'koffi-x64-'))
try {
  const tarball = execFileSync('npm', ['pack', `@koromix/koffi-darwin-x64@${version}`, '--silent'], { cwd: work, encoding: 'utf8' }).trim().split('\n').pop()
  mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', join(work, tarball), '-C', target, '--strip-components=1'])
  console.log(`[next-ide] fetched @koromix/koffi-darwin-x64@${version}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
