import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasoPeriodoProps {
    /** "Mes", "Semana" o "Día": nombra el grupo y los botones ("Mes anterior", "Mes siguiente"). */
    unidad: string
    /** El período que se ve: "Octubre 2026". */
    texto: string
    onAnterior: () => void
    onSiguiente: () => void
    className?: string
}

const CLASE_BOTON =
    'flex h-full w-[30px] items-center justify-center text-tinta-2 transition-colors hover:bg-superficie hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primario'

/** `‹ Octubre 2026 ›` en un solo control de 32 px, del mismo alto que el segmentado. */
export default function PasoPeriodo({ unidad, texto, onAnterior, onSiguiente, className }: PasoPeriodoProps) {
    return (
        <div
            role="group"
            aria-label={unidad}
            className={cn('inline-flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-linea bg-tarjeta', className)}
        >
            <button type="button" aria-label={`${unidad} anterior`} onClick={onAnterior} className={CLASE_BOTON}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-[104px] whitespace-nowrap border-x border-linea px-1.5 text-center text-[13px] font-semibold leading-[30px] text-tinta">
                {texto}
            </span>
            <button type="button" aria-label={`${unidad} siguiente`} onClick={onSiguiente} className={CLASE_BOTON}>
                <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
        </div>
    )
}
