import { useEffect, useState, type ReactNode } from 'react'
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
    /** Aviso opcional arriba de la lista de motivos. Se usa para decirle al vendedor que
     *  los rubros que ya cargó no van a contar como visita. */
    aviso?: ReactNode
    /** Si se pasa, arriba de los motivos aparece "Volver más tarde" como una opción aparte:
     *  se elige igual que un motivo (excluyente con ellos) y el botón del pie la confirma. */
    onVolverMasTarde?: () => void
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
    aviso,
    onVolverMasTarde,
}: ResolucionSheetProps) {
    const [selected, setSelected] = useState<number[]>([])
    const [volver, setVolver] = useState(false)

    // The sheet stays mounted across separate open sessions (callers toggle `open`
    // rather than unmount it), so without this the previous visit's motivo
    // selection would bleed into the next one.
    useEffect(() => {
        if (!open) {
            setSelected([])
            setVolver(false)
        }
    }, [open])

    function toggle(id: number) {
        setVolver(false)
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    }

    function toggleVolver() {
        setSelected([])
        setVolver(v => !v)
    }

    const eligeVolver = volver && !!onVolverMasTarde

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            eyebrow={eyebrow}
            // Mismo criterio que EstadoVisitaSheet: el motivo de cierre puede tener
            // muchas opciones y la acción no puede depender de scrollear hasta el final.
            footer={
                <Button
                    disabled={selected.length === 0 && !eligeVolver}
                    loading={submitting}
                    onClick={() => (eligeVolver ? onVolverMasTarde!() : onConfirm(selected))}
                    className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90"
                >
                    {submitting ? 'Guardando…' : eligeVolver ? 'Volver más tarde' : confirmLabel}
                </Button>
            }
        >
            {/* Primero y separada de los motivos: no es un motivo de no visita sino otra
                salida (no registra nada y el cliente queda pendiente). */}
            {onVolverMasTarde && (
                <>
                    <button
                        onClick={toggleVolver}
                        className={`flex w-full items-start gap-2.5 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left ${
                            volver ? 'border-[#B9CCEC] bg-[#EEF3FB]' : 'border-[#E4E8F0] bg-white'
                        }`}
                    >
                        <Casilla on={volver} />
                        <span className="min-w-0">
                            <span className={`block text-sm font-bold ${volver ? 'text-[#182645]' : 'text-[#3B4560]'}`}>
                                Volver más tarde
                            </span>
                            <span className="block text-[12px] font-semibold leading-snug text-dsmuted">
                                No se registra la visita: el cliente queda pendiente para volver hoy.
                            </span>
                        </span>
                    </button>
                    <p className="mb-2 mt-4 text-[9.5px] font-bold uppercase tracking-wide text-dsmuted">
                        O un motivo de no visita
                    </p>
                </>
            )}
            {aviso && (
                <div
                    data-testid="resolucion-aviso"
                    className="mb-3 rounded-md border border-[#FCD9A5] bg-[#FFF7EC] px-3 py-2 text-[12.5px] font-semibold leading-snug text-[#8A5A12]"
                >
                    {aviso}
                </div>
            )}
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
                            <Casilla on={on} />
                            <span className={`text-sm font-bold ${on ? 'text-[#182645]' : 'text-[#3B4560]'}`}>{m.descripcion}</span>
                        </button>
                    )
                })}
            </div>
        </BottomSheet>
    )
}

function Casilla({ on }: { on: boolean }) {
    return (
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
    )
}
