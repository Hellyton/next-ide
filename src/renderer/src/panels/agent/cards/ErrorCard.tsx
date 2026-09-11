export function ErrorCard({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs whitespace-pre-wrap text-red-300">
      {message}
    </div>
  )
}
