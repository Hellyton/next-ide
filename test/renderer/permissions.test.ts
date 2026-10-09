import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, decisionLabel, nextMode, parseMode, permissionSummary } from '@renderer/agent/permissions'

describe('permissions view helpers', () => {
  it('summarizes the most relevant input field', () => {
    expect(permissionSummary('Bash', { command: 'rm -rf dist' })).toBe('rm -rf dist')
    expect(permissionSummary('Write', { file_path: '/a.ts', content: 'x' })).toBe('/a.ts')
    expect(permissionSummary('WebFetch', { url: 'https://x.dev' })).toBe('https://x.dev')
    expect(permissionSummary('mcp__db__query', { sql: 'select 1' })).toBe('{"sql":"select 1"}')
  })

  it('labels decisions in pt-BR and modes like the Claude Code CLI', () => {
    expect(decisionLabel('allow')).toBe('Permitido')
    expect(decisionLabel('allow-always')).toBe('Sempre permitido')
    expect(decisionLabel('deny')).toBe('Negado')
    expect(decisionLabel('cancelled')).toBe('Cancelado')
    expect(MODE_OPTIONS.map((m) => m.value)).toEqual(['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions'])
    expect(MODE_OPTIONS.map((m) => m.label)).toEqual(['auto mode on', 'manual mode on', 'accept edits on', 'plan mode on', 'bypass permissions on'])
  })

  it('cycles modes on shift+tab like the CLI, never into bypass', () => {
    expect(nextMode('default')).toBe('acceptEdits')
    expect(nextMode('acceptEdits')).toBe('plan')
    expect(nextMode('plan')).toBe('auto')
    expect(nextMode('auto')).toBe('default')
    expect(nextMode('bypassPermissions')).toBe('default')
    expect(nextMode(undefined)).toBe('acceptEdits')
  })

  it('parses /mode arguments by alias or SDK name', () => {
    expect(parseMode('manual')).toBe('default')
    expect(parseMode('accept')).toBe('acceptEdits')
    expect(parseMode('acceptEdits')).toBe('acceptEdits')
    expect(parseMode(' PLAN ')).toBe('plan')
    expect(parseMode('bypass')).toBe('bypassPermissions')
    expect(parseMode('turbo')).toBeNull()
  })
})
