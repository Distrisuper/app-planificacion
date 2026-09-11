import { ChevronUp } from 'lucide-react'
import { formatearDuracion } from '@/lib/visitaTimer'
import { estadoVisitaVivo, PALETA_VISITA_VIVO } from '@/lib/estadoDuracion'
import { useVisitaTimer } from '@/hooks/useVisitaTimer'

interface VisitaEnCursoBarProps {
    visitaId: number
    nombreCliente: string
    /** true = el vendedor está lejos del cliente de esta visita, con la visita todavía
     *  abierta — ver docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md.
     *  Naranja/rojo es a propósito la misma paleta que usa `dsred` para el error de
     *  "estás lejos del cliente" al iniciar: mismo significado, mismo color. */
    alejado?: boolean
    onExpandir: () => void
}

/** Barra flotante que queda visible sobre la agenda cuando se minimiza una visita en curso.
 *  El color lo decide el semáforo de `estadoDuracion.ts`, compartido con el eyebrow de
 *  `VisitaSheet`: es la misma visita, y minimizar el sheet no puede cambiarle el color. */
export default function VisitaEnCursoBar({
    visitaId,
    nombreCliente,
    alejado,
    onExpandir,
}: VisitaEnCursoBarProps) {
    const segundos = useVisitaTimer(visitaId)
    const estado = estadoVisitaVivo(segundos, alejado)

    return (
        <button
            onClick={onExpandir}
            data-testid="visita-en-curso-bar"
            className={`fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-[0_6px_20px_rgba(180,83,9,.35)] ${PALETA_VISITA_VIVO[estado].barra}`}
        >
            <span className="flex min-w-0 items-center gap-2 text-left">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
                <span className="min-w-0">
                    <span className="block truncate text-[13px] font-extrabold leading-tight">
                        {alejado
                            ? `Te alejaste de ${nombreCliente} y la visita sigue abierta`
                            : `Visitando a ${nombreCliente}`}
                    </span>
                    {/* El cronómetro y el "· visita larga" van en el MISMO span para que
                     *  compartan la línea: el aviso solo tiene sentido pegado al número que
                     *  lo justifica, y una segunda línea rompería el alto de la barra
                     *  justo en el caso raro. No se muestra si está alejado — ahí la
                     *  primera línea ya dice lo único que hay que hacer. */}
                    <span className="block text-[11.5px] font-bold tabular-nums opacity-90">
                        {formatearDuracion(segundos)}
                        {estado === 'larga' && ' · visita larga'}
                    </span>
                </span>
            </span>
            <ChevronUp className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} />
        </button>
    )
}
