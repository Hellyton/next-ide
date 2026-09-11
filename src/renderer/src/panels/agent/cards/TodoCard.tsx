import type { Todo } from '../../../agent/toolView'

const ICON: Record<Todo['status'], string> = { pending: '☐', in_progress: '◐', completed: '☑' }

export function TodoCard({ todos }: { todos: Todo[] }) {
  return (
    <div className="rounded border border-neutral-800 px-3 py-2 text-xs" data-testid="todo-card">
      <div className="mb-1 font-medium text-neutral-300">Tarefas</div>
      <ul className="space-y-0.5">
        {todos.map((t, i) => (
          <li key={i} className={t.status === 'completed' ? 'text-neutral-500 line-through' : t.status === 'in_progress' ? 'text-sky-300' : 'text-neutral-300'}>
            {ICON[t.status]} {t.content}
          </li>
        ))}
      </ul>
    </div>
  )
}
