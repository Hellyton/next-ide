import type { PermissionDecision } from '@shared/agent'
import type { PermissionItem } from '../../../agent/chatReducer'
import { decisionLabel, permissionSummary } from '../../../agent/permissions'

export function PermissionCard({ item, panelId }: { item: PermissionItem; panelId: string }) {
  const respond = (decision: PermissionDecision) =>
    void window.api.invoke('agent:respondPermission', panelId, item.requestId, decision).catch((err) => console.error('[next-ide] permission reply failed', err))
  return (
    <div data-testid="permission-card" className={`rounded border px-3 py-2 text-xs ${item.decision ? 'border-neutral-800 text-neutral-500' : 'border-orange-700 bg-orange-950/30 text-neutral-200'}`}>
      <div className="font-medium">
        {item.decision ? '' : '⚠ '}
        {item.title ?? `Permitir ${item.toolName}?`}
      </div>
      <code className="mt-1 block truncate text-neutral-400">
        {item.toolName}: {permissionSummary(item.toolName, item.input)}
      </code>
      {item.decision ? (
        <div className="mt-1">{decisionLabel(item.decision)}</div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600" onClick={() => respond('allow')}>
            Permitir
          </button>
          {item.canAlwaysAllow && (
            <button className="rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600" onClick={() => respond('allow-always')}>
              Sempre neste projeto
            </button>
          )}
          <button className="rounded bg-red-800 px-2 py-1 text-white hover:bg-red-700" onClick={() => respond('deny')}>
            Negar
          </button>
        </div>
      )}
    </div>
  )
}
