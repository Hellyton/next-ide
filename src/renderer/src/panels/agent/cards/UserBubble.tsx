export function UserBubble({ text, images }: { text: string; images: number }) {
  return (
    <div data-testid="user-bubble" className="ml-auto max-w-[85%] rounded-lg bg-neutral-800 px-3 py-2 text-sm whitespace-pre-wrap text-neutral-100">
      {text}
      {images > 0 && <div className="mt-1 text-xs text-neutral-400">📎 {images} imagem(ns)</div>}
    </div>
  )
}
