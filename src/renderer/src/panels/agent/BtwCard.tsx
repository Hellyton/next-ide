import type { SideAnswer } from '@shared/agent'
import { TextBlock } from './cards/TextBlock'

export type BtwState = { question: string; answer: SideAnswer | null }

/** /btw answer, floating above the composer; it is never part of the chat. */
export function BtwCard({ btw, onClose }: { btw: BtwState; onClose(): void }) {
  const { question, answer } = btw
  return (
    <div data-testid="btw-card" className="mx-2 mb-1 max-h-[40vh] overflow-y-auto rounded border border-sky-900 bg-sky-950/20 px-3 py-2 text-sm">
      <div className="mb-1 flex items-start gap-2 text-xs text-sky-300">
        <span className="font-semibold">/btw</span>
        <span className="flex-1 whitespace-pre-wrap text-neutral-400">{question}</span>
        <button aria-label="Fechar /btw" className="rounded px-1 text-neutral-400 hover:bg-neutral-800" onClick={onClose}>
          ×
        </button>
      </div>
      {answer === null ? (
        <div className="text-xs text-neutral-500">pensando…</div>
      ) : answer.ok ? (
        <TextBlock text={answer.text} streaming={false} />
      ) : (
        <div className="text-xs text-amber-300">{answer.message}</div>
      )}
      <div className="mt-1 text-[10px] text-neutral-600">Esc fecha · não entra na conversa</div>
    </div>
  )
}
