import { useState } from 'react'
import BottomSheet from './ui/BottomSheet'
import type { IMotivo } from '@/types/planificacion'

interface ResolucionSheetProps {
    open: boolean
    motivos: IMotivo[]
    confirmLabel: string
    onConfirm: (motivoIds: number[]) => void
    onClose: () => void
    submitting?: boolean
}

export default function ResolucionSheet({ open, motivos, confirmLabel, onConfirm, onClose, submitting }: ResolucionSheetProps) {
    const [selected, setSelected] = useState<number[]>([])

    function toggle(id: number) {
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    }

    return (
        <BottomSheet open={open} onClose={onClose} title="Resolución" eyebrow="Propuesta comercial">
            <div className="flex flex-col gap-2">
                {motivos.map(m => {
                    const on = selected.includes(m.motivoId)
                    return (
                        <button
                            key={m.motivoId}
                            onClick={() => toggle(m.motivoId)}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold ${
                                on ? 'border-dsnavy bg-dsnavy/5 text-dsnavy' : 'border-slate-200 text-dsnavy'
                            }`}
                        >
                            <span className={`grid h-5 w-5 place-items-center rounded ${on ? 'bg-dsnavy text-white' : 'border border-slate-300'}`}>
                                {on ? '✓' : ''}
                            </span>
                            {m.descripcion}
                        </button>
                    )
                })}
            </div>
            <button
                disabled={selected.length === 0 || submitting}
                onClick={() => onConfirm(selected)}
                className="mt-4 w-full rounded-lg bg-dsgreen py-3 text-sm font-bold text-white disabled:opacity-40"
            >
                {submitting ? 'Guardando…' : confirmLabel}
            </button>
        </BottomSheet>
    )
}
