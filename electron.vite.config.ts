import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { injectCsp } from './build/csp'

const shared = { '@shared': resolve('src/shared') }

function productionCsp(): Plugin {
  return { name: 'next-ide-csp', apply: 'build', transformIndexHtml: (html) => injectCsp(html) }
}

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss(), productionCsp()],
  },
})
