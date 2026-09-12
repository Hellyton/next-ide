import { describe, expect, it } from 'vitest'
import { fileIcon } from '@renderer/files/fileIcon'
import { classifyOutputLine } from '@renderer/agent/outputStyle'

describe('fileIcon', () => {
  it('picks kind and color by extension, name and folder state', () => {
    expect(fileIcon('app.ts', false)).toEqual({ kind: 'code', color: '#3178c6' })
    expect(fileIcon('App.TSX', false).color).toBe('#3178c6')
    expect(fileIcon('package.json', false)).toEqual({ kind: 'config', color: '#8bc500' })
    expect(fileIcon('Dockerfile.dev', false)).toEqual({ kind: 'config', color: '#2496ed' })
    expect(fileIcon('README.md', false)).toEqual({ kind: 'doc', color: '#5b9dd9' })
    expect(fileIcon('logo.png', false).kind).toBe('image')
    expect(fileIcon('LICENSE', false)).toEqual({ kind: 'file', color: '#9aa0a6' })
    expect(fileIcon('src', true).kind).toBe('folder')
    expect(fileIcon('src', true, true).kind).toBe('folder-open')
  })
})

describe('classifyOutputLine', () => {
  it('marks errors, warnings, successes and status lines', () => {
    expect(classifyOutputLine('Error: build failed')).toBe('error')
    expect(classifyOutputLine('exit=1')).toBe('error')
    expect(classifyOutputLine('Warning: bundle initial exceeded maximum budget')).toBe('warn')
    expect(classifyOutputLine('✓ 24 passed')).toBe('ok')
    expect(classifyOutputLine('exit=0')).toBe('ok')
    expect(classifyOutputLine(' M src/app.ts')).toBe('path')
    expect(classifyOutputLine('hello world')).toBeUndefined()
    expect(classifyOutputLine('   ')).toBeUndefined()
  })
})
