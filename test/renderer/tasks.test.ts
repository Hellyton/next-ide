import { describe, expect, it } from 'vitest'
import type { TaskInfo } from '@shared/agent'
import { visibleTasks } from '@renderer/agent/tasks'

const task = (over: Partial<TaskInfo> = {}): TaskInfo => ({ id: 't1', description: 'npm run build', status: 'running', ...over })

describe('visibleTasks', () => {
  it('hides a finished task once its id is in the hidden set', () => {
    const t = task({ status: 'stopped' })
    expect(visibleTasks([t], new Set(['t1']))).toEqual([])
  })

  it('shows a finished task not yet hidden', () => {
    const t = task({ status: 'stopped' })
    expect(visibleTasks([t], new Set())).toEqual([t])
  })

  it('shows the task again once it is running under the same id, even if that id is still in the hidden set', () => {
    const t = task({ status: 'running' })
    expect(visibleTasks([t], new Set(['t1']))).toEqual([t])
  })
})
