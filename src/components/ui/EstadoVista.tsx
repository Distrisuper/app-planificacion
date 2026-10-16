import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type EstadoVistaProps =
    | { estado: 'cargando'; className?: string }
    /** `texto` dice qué hacer: "Probá con otro período o tipo de persona." */
    | { estado: 'vacio'; titulo: string; texto?: string; className?: string }
    | { estado: 'error'; titulo: string; texto?: string; onReintentar?: () => void; className?: string }

/**
 * Cargando, vacío y error, iguales en toda la app. La carga mantiene la forma de lo que viene
 * (skeleton, no un "Cargando…" suelto); el vacío dice qué hacer; el error dice qué pasó y
 * ofrece reintentar.
 */
export default function EstadoVista(props: EstadoVistaProps) {
    if (props.estado === 'cargando') {
        return (
            <div role="status" aria-label="Cargando" className={cn('flex flex-col gap-2.5 py-2', props.className)}>
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-7 w-3/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
            </div>
        )
    }
    return (
        <div className={cn('flex flex-col items-start gap-1.5 rounded-lg bg-superficie px-4 py-5', props.className)}>
            <p className="text-sm font-semibold text-tinta">{props.titulo}</p>
            {props.texto && <p className="text-[13px] text-tinta-2">{props.texto}</p>}
            {props.estado === 'error' && props.onReintentar && (
                <button
                    type="button"
                    onClick={props.onReintentar}
                    className="mt-1.5 h-8 rounded-lg border border-linea bg-tarjeta px-3 text-[13px] font-semibold text-tinta hover:bg-superficie focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario"
                >
                    Reintentar
                </button>
            )}
        </div>
    )
}
