export type ErrorCardAction = { label: string; onAction(): void }

export function ErrorCard({ message, action }: { message: string; action?: ErrorCardAction }) {
  return (
    <div role="alert" className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
      <div className="whitespace-pre-wrap">{message}</div>
      {action && (
        <button type="button" onClick={action.onAction} className="mt-2 rounded bg-red-900/60 px-2 py-0.5 text-red-100 hover:bg-red-800">
          {action.label}
        </button>
      )}
    </div>
  )
}
