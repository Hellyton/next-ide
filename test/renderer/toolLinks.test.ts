import { describe, expect, it } from 'vitest'
import { parseToolOutputLine, projectForPath, resolveToolPath, toolFileTarget } from '@renderer/agent/toolLinks'

describe('toolLinks', () => {
  it('resolveToolPath makes relative paths absolute and normalizes dots', () => {
    expect(resolveToolPath('/p', 'src/a.ts')).toBe('/p/src/a.ts')
    expect(resolveToolPath('/p', './src/../b.ts')).toBe('/p/b.ts')
    expect(resolveToolPath('/p', '/abs/x.ts')).toBe('/abs/x.ts')
  })

  it('toolFileTarget reads file_path / notebook_path and Read offsets', () => {
    expect(toolFileTarget('Edit', { file_path: '/p/a.ts' })).toEqual({ path: '/p/a.ts' })
    expect(toolFileTarget('Read', { file_path: '/p/a.ts', offset: 120, limit: 40 })).toEqual({ path: '/p/a.ts', line: 120 })
    expect(toolFileTarget('NotebookEdit', { notebook_path: '/p/n.ipynb' })).toEqual({ path: '/p/n.ipynb' })
    expect(toolFileTarget('Grep', { pattern: 'x', path: 'src' })).toBeNull()
    expect(toolFileTarget('Bash', { command: 'ls' })).toBeNull()
  })

  it('parseToolOutputLine understands grep content lines and bare file lists', () => {
    expect(parseToolOutputLine('src/a.ts:12:const x = 1')).toEqual({ path: 'src/a.ts', line: 12 })
    expect(parseToolOutputLine('/p/src/a.ts-3-context')).toBeNull()
    expect(parseToolOutputLine('/p/src/a.ts')).toEqual({ path: '/p/src/a.ts' })
    expect(parseToolOutputLine('src/components/Button.tsx')).toEqual({ path: 'src/components/Button.tsx' })
    expect(parseToolOutputLine('Found 3 files')).toBeNull()
    expect(parseToolOutputLine('')).toBeNull()
  })

  it('projectForPath picks the deepest workspace folder containing the path', () => {
    expect(projectForPath(['/x', '/x/api'], '/x/api/src/a.ts')).toBe('/x/api')
    expect(projectForPath(['/x'], '/y/a.ts')).toBeNull()
  })
})
