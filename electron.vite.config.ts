import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { injectCsp } from './build/csp'

const shared = { '@shared': resolve('src/shared') }

// Shown in the sidebar footer so the running build is identifiable (see sidebar/buildInfo.ts).
function buildInfo() {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  let commit: string | null = null
  let dirty = false
  try {
    commit = git('rev-parse', '--short', 'HEAD')
    dirty = git('status', '--porcelain', '--untracked-files=no') !== ''
  } catch {
    // Not a git checkout: the footer just omits the commit.
  }
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  return { version, commit, dirty, builtAt: new Date().toISOString() }
}

function productionCsp(): Plugin {
  return { name: 'next-ide-csp', apply: 'build', transformIndexHtml: (html) => injectCsp(html) }
}

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss(), productionCsp()],
    define: { __BUILD_INFO__: JSON.stringify(buildInfo()) },
  },
})
