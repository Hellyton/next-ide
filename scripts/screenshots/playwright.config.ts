import { defineConfig } from '@playwright/test'

// Captures the README screenshots: `npm run screenshots` (builds first). Uses the scripted fake agent,
// so no account, network or real project is involved.
export default defineConfig({ testDir: '.', testMatch: 'capture.spec.ts', timeout: 120_000, workers: 1, reporter: 'list' })
