import { useEffect, useState } from 'react'
import BottomSheet from './ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useCerrarCiclo } from '@/hooks/useCiclo'
import type { ICerrarCicloResult } from '@/types/planificacion'

interface CerrarSemanaSheetProps {
    open: boolean
    onClose: () => void
    onCerrado: () => void
}

/** El 409 de /ciclo/cerrar es el ÚNICO con forma irregular: ok:0 pero con `data`
 *  (las dos listas de bloqueo), no con `code`. */
function bloqueosDe(err: unknown): ICerrarCicloResult | null {
    const e = err as { response?: { status?: number; data?: { data?: ICerrarCicloResult } } }
    if (e?.response?.status !== 409) return null
    return e.response.data?.data ?? null
}

export default function CerrarSemanaSheet({ open, onClose, onCerrado }: CerrarSemanaSheetProps) {
    const cerrar = useCerrarCiclo()
    const [bloqueos, setBloqueos] = useState<ICerrarCicloResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            setBloqueos(null)
            setError(null)
        }
    }, [open])

    async function onConfirmar() {
        setBloqueos(null)
        setError(null)
        try {
            await cerrar.mutateAsync()
            onCerrado()
        } catch (err) {
            const pendientes = bloqueosDe(err)
            if (pendientes) {
                setBloqueos(pendientes)
                return
            }
            setError('No se pudo cerrar la semana. Volvé a intentar.')
        }
    }

    const clientes = bloqueos?.clientesPendientes ?? []
    const visitas = bloqueos?.visitasConRubrosPendientes ?? []

    return (
        <BottomSheet open={open} onClose={onClose} title="Cerrar semana" eyebrow="Vuelta actual">
            <p className="mb-3 text-[13px] leading-snug text-dsmuted">
                Al cerrar la semana se registra la vuelta completa. No se puede reabrir.
            </p>

            {clientes.length > 0 && (
                <div className="mb-2.5 rounded-[11px] border-[1.5px] border-[#F3C9C9] bg-[#FEF6F6] p-3">
                    <p className="text-[13px] font-extrabold text-dsred">
                        {clientes.length}{' '}
                        {clientes.length === 1 ? 'cliente sin resolver' : 'clientes sin resolver'}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#54607A]">
                        Visitalos o marcalos como "No visité" antes de cerrar.
                    </p>
                </div>
            )}

            {visitas.length > 0 && (
                <div className="mb-2.5 rounded-[11px] border-[1.5px] border-[#F0D8A8] bg-[#FEF8EC] p-3">
                    <p className="text-[13px] font-extrabold text-[#B45309]">
                        {visitas.length}{' '}
                        {visitas.length === 1
                            ? 'visita con rubros sin cargar'
                            : 'visitas con rubros sin cargar'}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#54607A]">
                        Entrá a cada una desde su tarjeta y completá la resolución.
                    </p>
                </div>
            )}

            {error && <p className="mb-2.5 text-[12.5px] font-semibold text-dsred">{error}</p>}

            <Button
                onClick={onConfirmar}
                disabled={cerrar.isPending}
                className="mt-1 h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
            >
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar semana'}
            </Button>
        </BottomSheet>
    )
}
