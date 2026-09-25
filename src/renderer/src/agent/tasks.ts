import type { TaskInfo } from '@shared/agent'

/**
 * Tasks the bar should render: a running task is always shown (even if a previous run under the
 * same id was dismissed), and a finished task is shown until its id lands in `hidden`.
 */
export function visibleTasks(tasks: TaskInfo[], hidden: ReadonlySet<string>): TaskInfo[] {
  return tasks.filter((t) => t.status === 'running' || !hidden.has(t.id))
}
