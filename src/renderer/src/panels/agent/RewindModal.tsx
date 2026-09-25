import { useEffect, useState } from 'react'
import type { RewindFiles } from '@shared/agent'
import type { RewindMode, RewindTarget } from '../../agent/rewind'

type Props = { panelId: string; targets: RewindTarget[]; onRun(mode: RewindMode, target: RewindTarget): void; onClose(): void }

export function RewindModal({ panelId, targets, onRun, onClose }: Props) {
  const [picked, setPicked] = useState<RewindTarget | null>(null)
  const [preview, setPreview] = useState<RewindFiles | { message: string } | null>(null)
  useEffect(() => {
    if (!picked) return
    setPreview(null)
    let alive = true
    window.api
      .invoke('agent:rewindFiles', panelId, picked.id, true)
      .then((r) => alive && setPreview(r.ok ? r.value : { message: r.message }))
      .catch((err) => alive && setPreview({ message: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [panelId, picked])
  const files = preview && 'canRewind' in preview ? preview : null
  const codeBlocked = !files?.canRewind
  const codeReason = preview && 'message' in preview ? preview.message : files && !files.canRewind ? (files.error ?? 'Sem checkpoint de arquivos.') : null
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label="Voltar para uma mensagem" className="w-[min(560px,90%)] rounded border border-neutral-700 bg-neutral-900 p-3 text-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 font-medium">Voltar para uma mensagem</div>
        {targets.length === 0 && <div className="text-neutral-500">Nenhuma mensagem para voltar.</div>}
        {!picked && (
          <div className="max-h-80 space-y-1 overflow-auto">
            {targets.map((t) => (
              <button key={t.id} className="block w-full truncate rounded px-2 py-1 text-left text-neutral-200 hover:bg-neutral-800" onClick={() => setPicked(t)}>
                {t.text || '(imagem)'}
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="space-y-2">
            <div className="truncate rounded bg-neutral-800 px-2 py-1 text-neutral-200">{picked.text || '(imagem)'}</div>
            <div data-testid="rewind-preview" className="text-xs text-neutral-400">
              {!preview && 'Calculando mudanças…'}
              {files?.canRewind && `${files.filesChanged.length} arquivo(s) · +${files.insertions} −${files.deletions}`}
              {codeReason && <span className="text-amber-300">{codeReason}</span>}
            </div>
            {files?.canRewind && files.filesChanged.length > 0 && (
              <ul className="max-h-32 overflow-auto text-xs text-neutral-500">
                {files.filesChanged.map((f) => (
                  <li key={f} className="truncate">{f}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-orange-600 px-2 py-1 text-white hover:bg-orange-500 disabled:opacity-40" disabled={codeBlocked} onClick={() => onRun('both', picked)}>
                Código e conversa
              </button>
              <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700" onClick={() => onRun('conversation', picked)}>
                Só conversa
              </button>
              <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700 disabled:opacity-40" disabled={codeBlocked} onClick={() => onRun('code', picked)}>
                Só código
              </button>
              <span className="flex-1" />
              <button className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800" onClick={() => setPicked(null)}>
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
