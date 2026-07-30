import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import type { IMotivo } from '@/types/planificacion'

interface ResolucionSheetProps {
    open: boolean
    motivos: IMotivo[]
    confirmLabel: string
    onConfirm: (motivoIds: number[]) => void
    onClose: () => void
    submitting?: boolean
    title?: string
    eyebrow?: string
}

export default function ResolucionSheet({
    open,
    motivos,
    confirmLabel,
    onConfirm,
    onClose,
    submitting,
    title = 'Resolución',
    eyebrow = 'Propuesta comercial',
}: ResolucionSheetProps) {
    const [selected, setSelected] = useState<number[]>([])

    // The sheet stays mounted across separate open sessions (callers toggle `open`
    // rather than unmount it), so without this the previous visit's motivo
    // selection would bleed into the next one.
    useEffect(() => {
        if (!open) setSelected([])
    }, [open])

    function toggle(id: number) {
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    }

    return (
        <BottomSheet open={open} onClose={onClose} title={title} eyebrow={eyebrow}>
            <div className="flex flex-col gap-2">
                {motivos.map(m => {
                    const on = selected.includes(m.motivoId)
                    return (
                        <button
                            key={m.motivoId}
                            onClick={() => toggle(m.motivoId)}
                            className={`flex w-full items-center gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left ${
                                on ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                            }`}
                        >
                            <span
                                className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md border-[1.5px]"
                                style={{
                                    borderColor: on ? '#213D82' : '#CBD2E0',
                                    background: on ? '#213D82' : '#fff',
                                    color: on ? '#fff' : 'transparent',
                                }}
                            >
                                <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />
                            </span>
                            <span className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}>{m.descripcion}</span>
                        </button>
                    )
                })}
            </div>
            <Button
                disabled={selected.length === 0}
                loading={submitting}
                onClick={() => onConfirm(selected)}
                className="mt-4 h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
            >
                {submitting ? 'Guardando…' : confirmLabel}
            </Button>
        </BottomSheet>
    )
}
