import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, decisionLabel, permissionSummary } from '@renderer/agent/permissions'

describe('permissions view helpers', () => {
  it('summarizes the most relevant input field', () => {
    expect(permissionSummary('Bash', { command: 'rm -rf dist' })).toBe('rm -rf dist')
    expect(permissionSummary('Write', { file_path: '/a.ts', content: 'x' })).toBe('/a.ts')
    expect(permissionSummary('WebFetch', { url: 'https://x.dev' })).toBe('https://x.dev')
    expect(permissionSummary('mcp__db__query', { sql: 'select 1' })).toBe('{"sql":"select 1"}')
  })

  it('labels decisions and lists modes in pt-BR', () => {
    expect(decisionLabel('allow')).toBe('Permitido')
    expect(decisionLabel('allow-always')).toBe('Sempre permitido')
    expect(decisionLabel('deny')).toBe('Negado')
    expect(decisionLabel('cancelled')).toBe('Cancelado')
    expect(MODE_OPTIONS.map((m) => m.value)).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'])
  })
})
