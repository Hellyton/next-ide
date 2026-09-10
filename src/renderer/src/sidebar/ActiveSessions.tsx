import { stateDotClass } from '../dock/stateStyle'
import { useDock } from '../dock/dockStore'
import { useSessions } from '../stores/sessionsStore'

export function ActiveSessions() {
  const order = useSessions((s) => s.order)
  const byId = useSessions((s) => s.byId)
  return (
    <section data-testid="active-sessions" className="px-2 pb-3">
      <h2 className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
        Sessões ativas ({order.length})
      </h2>
      {order.map((id) => {
        const s = byId[id]!
        return (
          <button
            key={id}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
            onClick={() => useDock.getState().focus(id)}
          >
            <span className={stateDotClass(s.state)} />
            <span className="truncate">{s.title}</span>
          </button>
        )
      })}
    </section>
  )
}
