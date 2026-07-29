import { ChevronUp } from 'lucide-react'
import { formatearDuracion } from '@/lib/visitaTimer'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'

interface VisitaEnCursoBarProps {
    visitaId: number
    nombreCliente: string
    onExpandir: () => void
}

/** Barra flotante que queda visible sobre la agenda cuando se minimiza una visita en curso. */
export default function VisitaEnCursoBar({ visitaId, nombreCliente, onExpandir }: VisitaEnCursoBarProps) {
    const segundos = useVisitaTimer(visitaId)

    return (
        <button
            onClick={onExpandir}
            className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl bg-[#B45309] px-4 py-3 text-white shadow-[0_6px_20px_rgba(180,83,9,.35)]"
        >
            <span className="flex min-w-0 items-center gap-2 text-left">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
                <span className="min-w-0">
                    <span className="block truncate text-[13px] font-extrabold leading-tight">
                        Visitando a {nombreCliente}
                    </span>
                    <span className="block text-[11.5px] font-bold tabular-nums opacity-90">
                        {formatearDuracion(segundos)}
                    </span>
                </span>
            </span>
            <ChevronUp className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} />
        </button>
    )
}
