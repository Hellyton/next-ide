export function ThinkingBlock({ text }: { text: string }) {
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">pensamento</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  )
}
